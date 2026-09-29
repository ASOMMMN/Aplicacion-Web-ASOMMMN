import {
  CONFIG_LECTURA_POR_DEFECTO,
  configLecturaDesdeEnv,
  LectorPdf,
  leerDocumento,
} from './lectura-documento';

/**
 * Lector falso: simula un PDF de N páginas con un texto por página.
 * (pdfjs necesita import() dinámico, que Jest no permite sin
 * --experimental-vm-modules; el render real se verificó en Node.)
 */
function lectorFalso(
  paginas: string[],
  opciones: { renderFalla?: boolean } = {},
): { crear: () => LectorPdf; pedidas: { texto?: number; capturas?: number } } {
  const pedidas: { texto?: number; capturas?: number } = {};
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
    getScreenshot: ({ first }) => {
      pedidas.capturas = first;
      if (opciones.renderFalla) {
        return Promise.reject(new Error('canvas no disponible'));
      }
      return Promise.resolve({
        pages: paginas
          .slice(0, first)
          .map((_, i) => ({ dataUrl: `data:image/png;base64,PAGINA${i + 1}` })),
      });
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
const cfg = CONFIG_LECTURA_POR_DEFECTO;

describe('leerDocumento', () => {
  it('PDF con texto → texto (sin separadores de página) + imagen de la primera página', async () => {
    const { crear, pedidas } = lectorFalso([TEXTO_CERTIFICADO, 'Anexo']);
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-texto');
    expect(r.texto).toContain('19/12/2027');
    expect(r.texto).not.toMatch(/-- \d+ of \d+ --/);
    expect(r.imagenes).toEqual(['data:image/png;base64,PAGINA1']);
    expect(pedidas.capturas).toBe(1);
  });

  it('PDF escaneado (poco texto) → imágenes de todas las páginas leídas', async () => {
    const { crear } = lectorFalso(['', '', '']);
    const r = await leerDocumento(PDF, 'application/pdf', cfg, crear);
    expect(r.modo).toBe('pdf-visual');
    expect(r.texto).toBe('');
    expect(r.imagenes).toHaveLength(3);
    expect(r.paginasLeidas).toBe(3);
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
    expect(r.imagenes).toHaveLength(2);
    expect(pedidas).toEqual({ texto: 2, capturas: 2 });
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

  it('imagen → se envía tal cual', async () => {
    const r = await leerDocumento(Buffer.from('png'), 'image/png');
    expect(r.modo).toBe('imagen');
    expect(r.imagenes).toEqual([
      `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
    ]);
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
  });
});
