/**
 * Arma el PDF multipágina con los JPEG ya comprimidos. pdf-lib se importa
 * de forma dinámica: solo se descarga cuando se genera un PDF.
 *
 * El PDF no tiene capa de texto; la API lo detecta como escaneado y
 * renderiza cada página para el modelo de visión (modo "pdf-visual").
 */
export interface PaginaPdf {
  jpg: Uint8Array;
  /** Tamaño de la página antes de comprimir: fija el tamaño físico aunque la compresión la haya reducido. */
  anchoPx: number;
  altoPx: number;
}

export interface OpcionesPdf {
  /** Resolución nominal para calcular el tamaño físico de cada página. */
  dpi: number;
  titulo: string;
}

const PUNTOS_POR_PULGADA = 72;

export async function generarPdf(
  paginas: readonly PaginaPdf[],
  opciones: OpcionesPdf,
): Promise<Uint8Array> {
  if (paginas.length === 0) {
    throw new Error('No hay páginas para generar el PDF.');
  }
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  // Sin autor ni otros metadatos personales.
  doc.setTitle(opciones.titulo);
  doc.setCreator('ASOMMMN – escáner de documentos');
  doc.setProducer('ASOMMMN');

  for (const p of paginas) {
    const imagen = await doc.embedJpg(p.jpg);
    const ancho = (p.anchoPx / opciones.dpi) * PUNTOS_POR_PULGADA;
    const alto = (p.altoPx / opciones.dpi) * PUNTOS_POR_PULGADA;
    const pagina = doc.addPage([ancho, alto]);
    pagina.drawImage(imagen, { x: 0, y: 0, width: ancho, height: alto });
  }
  return doc.save();
}

/** Nombre del archivo: "INE_escaneo_2026-10-26.pdf" (sin caracteres especiales). */
export function nombreArchivoEscaneo(etiqueta: string, fecha = new Date()): string {
  const base =
    etiqueta
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'documento';
  const dia = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
  return `${base}_escaneo_${dia}.pdf`;
}
