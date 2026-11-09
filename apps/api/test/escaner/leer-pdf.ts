/**
 * Ejecuta la lectura REAL de un PDF (pdf-parse + pdf.js + @napi-rs/canvas)
 * fuera de Jest: pdf.js carga su worker con import() nativo, que el
 * entorno vm de Jest no permite. Lo usa lectura-documento.escaner.spec.ts.
 *
 *   node -r ts-node/register/transpile-only test/escaner/leer-pdf.ts leer   <pdf> <salida.json>
 *   node -r ts-node/register/transpile-only test/escaner/leer-pdf.ts render <pdf> <salida.png> <página>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFParse } from 'pdf-parse';
import {
  CONFIG_LECTURA_POR_DEFECTO,
  leerDocumento,
} from '../../src/modules/docs-personales/ia/lectura-documento';

async function main() {
  const [accion, pdf, salida, pagina] = process.argv.slice(2);
  const buffer = readFileSync(pdf);
  if (accion === 'leer') {
    const r = await leerDocumento(buffer, 'application/pdf');
    writeFileSync(
      salida,
      JSON.stringify({
        ...r,
        // Las imágenes pesan; basta saber de qué página son y que son imágenes.
        imagenes: r.imagenes.map((i) => ({
          pagina: i.pagina,
          parte: i.parte,
          ancho: i.ancho,
          esImagen: i.dataUrl.startsWith('data:image/'),
        })),
      }),
    );
    return;
  }
  if (accion === 'render') {
    const parser = new PDFParse({ data: buffer });
    try {
      const { pages } = await parser.getScreenshot({
        partial: [Number(pagina)],
        desiredWidth: CONFIG_LECTURA_POR_DEFECTO.anchoPx,
        imageDataUrl: false,
        imageBuffer: true,
      });
      writeFileSync(salida, Buffer.from(pages[0].data));
    } finally {
      await parser.destroy();
    }
    return;
  }
  throw new Error(`Acción desconocida: ${accion}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
