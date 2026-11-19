/**
 * Web Worker del escáner: detección, enderezado, mejora y PDF fuera del
 * hilo principal para no congelar la interfaz. Solo recibe y devuelve
 * píxeles en memoria; no hace red ni guarda nada.
 */
import { generarPdf } from './pdf';
import { ProcesadorEscaner } from './procesador';
import type { RespuestaWorker, SolicitudWorker } from './protocolo';

const procesador = new ProcesadorEscaner();

const responder = (r: RespuestaWorker, transferir: Transferable[] = []) =>
  self.postMessage(r, { transfer: transferir });

self.onmessage = async (evento: MessageEvent<SolicitudWorker>) => {
  const s = evento.data;
  try {
    switch (s.tipo) {
      case 'cargar': {
        const { width, height, buffer } = s.imagen;
        procesador.cargar({ width, height, data: new Uint8ClampedArray(buffer) });
        responder({ id: s.id, ok: true, tipo: 'cargar' });
        break;
      }
      case 'detectar': {
        const resultado = procesador.detectar(s.opciones);
        responder({ id: s.id, ok: true, tipo: 'detectar', resultado });
        break;
      }
      case 'procesar': {
        const img = procesador.procesar(s.esquinas, s.modo, s.rotacion, s.ladoMax);
        const buffer = img.data.buffer as ArrayBuffer;
        responder(
          { id: s.id, ok: true, tipo: 'procesar', imagen: { width: img.width, height: img.height, buffer } },
          [buffer],
        );
        break;
      }
      case 'pdf': {
        // pdf-lib se importa de forma dinámica también aquí: solo se descarga al generar.
        const bytes = await generarPdf(s.paginas, s.opciones);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        responder({ id: s.id, ok: true, tipo: 'pdf', bytes: buffer }, [buffer]);
        break;
      }
      case 'liberar': {
        procesador.liberar();
        responder({ id: s.id, ok: true, tipo: 'liberar' });
        break;
      }
    }
  } catch (err) {
    responder({ id: s.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
