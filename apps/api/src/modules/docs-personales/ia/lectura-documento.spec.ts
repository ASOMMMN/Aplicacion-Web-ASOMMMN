import { createCanvas } from '@napi-rs/canvas';
import {
  CONFIG_LECTURA_POR_DEFECTO,
  configLecturaDesdeEnv,
  LectorPdf,
  leerDocumento,
} from './lectura-documento';

/** Página blanca con "renglones" negros (sin datos reales). */
function paginaPng(ancho = 850, alto = 1100): Uint8Array {
  const c = createCanvas(ancho, alto);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = '#000';
  for (let y = 100; y < 400; y += 30) ctx.fillRect(100, y, 500, 12);
  return c.toBuffer('image/png');
}

/**
 * Lector falso: simula un PDF de N páginas con un texto por página.
 * (pdfjs necesita import() dinámico, que Jest no permite sin
 * --experimental-vm-modules; el render real se verificó en Node y en Linux.)
 */
function lectorFalso(
  paginas: string[],
  opciones: { renderFalla?: boolean } = {},
): { crear: () => LectorPdf; pedidas: { texto?: number; capturas: number[] } } {
  const pedidas: { texto?: number; capturas: number[] } = { capturas: [] };
  const crear = (): LectorPdf => ({
    getInfo: () => Promise.resolve({ total: paginas.length }),
    getText: ({ first }) => {
      pedidas.texto = first;
      return Promise.resolve({
        text: paginas
          .slice(0, first)
          .map((t, i) => `${t}\n\n-- ${i + 1} of ${paginas.length} --`)
          .join('\n'),
      });
    },
    getScreenshot: ({ partial }) => {
      pedidas.capturas.push(...partial);
      if (opciones.renderFalla) {
        return Promise.reject(new Error('canvas no disponible'));
      }
      return Promise.resolve({ pages: [{ data: paginaPng() }] });
    },
    destroy: () => Promise.resolve(),
  });
  return { crear, pedidas };
}

const TEXTO_CERTIFICADO =
  'CERTIFICADO MÉDICO / MEDICAL CERTIFICATE. ' +
  'Fecha en la que se realizó el reconocimiento médico / Date on which medical examination was carried out: 19/12/2025. ' +
  'Fecha en la que expira el certificado médico / Expiration date of medical certificate: 19/12/2027.';

const PDF = Buffer.from('%PDF');
// Sin búsqueda de QR: tiene sus propias pruebas (qr-cadena.spec.ts).
const cfg = { ...CONFIG_LECTURA_POR_DEFECTO, maxPaginasQr: 0 };

describe('leerDocumento', () => {
  it('PDF con texto → texto (sin separadores) + imágenes de TODAS las páginas', async () => {
    const { crear, pedidas } = lectorFalso([TEXTO_CERTIFICADO, 'Anexo']);
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-texto');
    expect(r.texto).toContain('19/12/2027');
    expect(r.texto).not.toMatch(/-- \d+ of \d+ --/);
    expect(pedidas.capturas).toEqual([1, 2]); // una página a la vez
    expect(r.imagenes.map((i) => i.pagina)).toEqual([1, 2]);
    expect(r.imagenes[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('PDF escaneado (poco texto) → imágenes de todas las páginas leídas', async () => {
    const { crear } = lectorFalso(['', '', '']);
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-visual');
    expect(r.texto).toBe('');
    expect(new Set(r.imagenes.map((i) => i.pagina))).toEqual(
      new Set([1, 2, 3]),
    );
    expect(r.paginasLeidas).toBe(3);
  });

  it('las imágenes vienen recortadas (sin márgenes blancos)', async () => {
    const { crear } = lectorFalso(['']);
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    // La página mide 850 px; el contenido, ~500 px + margen.
    expect(r.imagenes[0].ancho).toBeLessThan(620);
  });

  it('respeta el máximo de páginas al leer texto y al renderizar', async () => {
    const { crear, pedidas } = lectorFalso(['', '', '', '', '', '']);
    const r = await leerDocumento(
      PDF,
      'application/pdf',
      { ...cfg, maxPaginas: 2 },
      crear,
    );
    expect(r.paginasTotales).toBe(6);
    expect(pedidas.texto).toBe(2);
    expect(pedidas.capturas).toEqual([1, 2]);
    expect(r.paginasLeidas).toBe(2);
  });

  it('el umbral de texto es configurable', async () => {
    const { crear } = lectorFalso([TEXTO_CERTIFICADO]);
    const r = await leerDocumento(
      PDF,
      'application/pdf',
      { ...cfg, umbralCaracteresTexto: 10_000 },
      crear,
    );
    expect(r.modo).toBe('pdf-visual');
  });

  it('escaneado y el render falla → pdf-crudo con aviso', async () => {
    const { crear } = lectorFalso([''], { renderFalla: true });
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-crudo');
    expect(r.aviso).toMatch(/canvas no disponible/);
  });

  it('con texto y el render falla → sigue solo con texto', async () => {
    const { crear } = lectorFalso([TEXTO_CERTIFICADO], { renderFalla: true });
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-texto');
    expect(r.imagenes).toEqual([]);
    expect(r.texto).toContain('19/12/2025');
  });

  it('imagen → se decodifica y se prepara', async () => {
    const r = await leerDocumento(Buffer.from(paginaPng()), 'image/png', cfg);
    expect(r.modo).toBe('imagen');
    expect(r.imagenes.length).toBeGreaterThan(0);
    expect(r.imagenes[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe('configLecturaDesdeEnv', () => {
  it('usa los valores de entorno válidos y los defaults para el resto', () => {
    const env: Record<string, string> = {
      IA_DOCS_MAX_PAGINAS: '6',
      IA_DOCS_UMBRAL_TEXTO: 'no-numero',
    };
    const c = configLecturaDesdeEnv((k) => env[k]);
    expect(c.maxPaginas).toBe(6);
    expect(c.umbralCaracteresTexto).toBe(cfg.umbralCaracteresTexto);
    expect(c.anchoPx).toBe(2400);
    expect(
      configLecturaDesdeEnv((k) => ({ IA_DOCS_QR_MAX_PAGINAS: '0' })[k])
        .maxPaginasQr,
    ).toBe(0);
  });
});
