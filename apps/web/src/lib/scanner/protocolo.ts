/** Mensajes entre el hilo principal y scanner.worker.ts. */
import type { OpcionesDeteccion } from './deteccion';
import type { OpcionesPdf, PaginaPdf } from './pdf';
import type { Cuadrilatero, ModoMejora, ResultadoDeteccion, Rotacion } from './tipos';

/** Imagen RGBA serializable (el buffer se transfiere o se copia). */
export interface ImagenTransferible {
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export type SolicitudWorker =
  | { tipo: 'cargar'; id: number; imagen: ImagenTransferible }
  | { tipo: 'detectar'; id: number; opciones?: Partial<OpcionesDeteccion> }
  | {
      tipo: 'procesar';
      id: number;
      esquinas: Cuadrilatero;
      modo: ModoMejora;
      rotacion: Rotacion;
      ladoMax: number;
    }
  | { tipo: 'pdf'; id: number; paginas: PaginaPdf[]; opciones: OpcionesPdf }
  | { tipo: 'liberar'; id: number };

export type RespuestaWorker =
  | { id: number; ok: true; tipo: 'cargar' }
  | { id: number; ok: true; tipo: 'liberar' }
  | { id: number; ok: true; tipo: 'detectar'; resultado: ResultadoDeteccion }
  | { id: number; ok: true; tipo: 'procesar'; imagen: ImagenTransferible }
  | { id: number; ok: true; tipo: 'pdf'; bytes: ArrayBuffer }
  | { id: number; ok: false; error: string };
