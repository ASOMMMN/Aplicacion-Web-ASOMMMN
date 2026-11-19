import { PDFDocument, PDFName } from 'pdf-lib';
import { comprimirPaginas, type ConfigCompresion } from '../compresion';
import { generarPdf, nombreArchivoEscaneo } from '../pdf';

const cfg: ConfigCompresion = {
  calidadJpeg: 0.85,
  calidadMinima: 0.6,
  pasoCalidad: 0.08,
  factorReduccion: 0.85,
  ladoMinLegible: 1400,
  tamanoObjetivoBytes: 2 * 1024 * 1024,
};

interface Pag {
  width: number;
  height: number;
}

/** Codificador falso: el peso crece con la calidad y el área. */
const falso = (bytesPorPixel: number) => {
  const llamadas: Array<{ calidad: number; escala: number }> = [];
  const codificar = async (p: Pag, calidad: number, escala: number) => {
    llamadas.push({ calidad, escala });
    const n = Math.round(p.width * p.height * escala * escala * calidad * bytesPorPixel);
    return new Uint8Array(n);
  };
  return { codificar, llamadas };
};

describe('comprimirPaginas', () => {
  const ine: Pag[] = [
    { width: 1600, height: 1010 },
    { width: 1600, height: 1010 },
  ];

  it('si ya cabe, un solo intento a la calidad inicial', async () => {
    const { codificar } = falso(0.3);
    const r = await comprimirPaginas(ine, codificar, cfg);
    expect(r.intentos).toBe(1);
    expect(r.calidad).toBe(0.85);
    expect(r.dentroDelObjetivo).toBe(true);
  });

  it('baja la calidad paso a paso hasta caber', async () => {
    const { codificar } = falso(0.9);
    const r = await comprimirPaginas(ine, codificar, cfg);
    expect(r.dentroDelObjetivo).toBe(true);
    expect(r.calidad).toBeLessThan(0.85);
    expect(r.calidad).toBeGreaterThanOrEqual(0.6);
    expect(r.escalas).toEqual([1, 1]);
  });

  it('al llegar a la calidad mínima reduce, pero nunca por debajo del lado mínimo legible', async () => {
    const paginas: Pag[] = Array.from({ length: 8 }, () => ({ width: 1545, height: 2000 }));
    const { codificar, llamadas } = falso(2);
    const r = await comprimirPaginas(paginas, codificar, cfg);
    expect(r.dentroDelObjetivo).toBe(false);
    expect(r.calidad).toBe(0.6);
    for (const e of r.escalas) {
      expect(2000 * e).toBeGreaterThanOrEqual(1400 - 1e-6);
    }
    expect(llamadas.every((l) => l.calidad >= 0.6)).toBe(true);
  });
});

/** JPEG real de 16×8 (rojo con un rectángulo blanco). */
const JPEG_16x8 = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAgEAAAAwkBAAAAAAAAAAAAAAAAFjMHEhQlMUFiY4GC/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAgEQAABQMFAAAAAAAAAAAAAAAAERITcQEiMQIUI0Gh/9oADAMBAAIRAxEAPwCtm5OmJ11wy2T6fmvLg0gnS4lbIlbFxT1TtgACuWpKk9imbTnfXqg7cFj2R//Z',
    'base64',
  ),
);

describe('generarPdf', () => {
  it('una página por imagen, con tamaño físico según los DPI', async () => {
    const bytes = await generarPdf(
      [
        { jpg: JPEG_16x8, anchoPx: 1600, altoPx: 1000 },
        { jpg: JPEG_16x8, anchoPx: 1600, altoPx: 1000 },
      ],
      { dpi: 200, titulo: 'INE (escaneo)' },
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(576); // 1600 px / 200 dpi = 8 in
    expect(height).toBeCloseTo(360);
    expect(doc.getTitle()).toBe('INE (escaneo)');
    expect(doc.getAuthor()).toBeUndefined();
    // La imagen va como JPEG (DCTDecode), sin recomprimir.
    const recursos = doc.getPage(0).node.Resources();
    expect(recursos?.get(PDFName.of('XObject'))).toBeDefined();
  });

  it('falla sin páginas', async () => {
    await expect(generarPdf([], { dpi: 200, titulo: 'x' })).rejects.toThrow();
  });
});

describe('nombreArchivoEscaneo', () => {
  it('quita acentos y caracteres especiales', () => {
    expect(nombreArchivoEscaneo('Credencial INE (anverso/reverso)', new Date(2026, 9, 26))).toBe(
      'Credencial_INE_anverso_reverso_escaneo_2026-10-26.pdf',
    );
    expect(nombreArchivoEscaneo('Título náutico', new Date(2026, 0, 5))).toBe(
      'Titulo_nautico_escaneo_2026-01-05.pdf',
    );
    expect(nombreArchivoEscaneo('***')).toMatch(/^documento_escaneo_/);
  });
});
