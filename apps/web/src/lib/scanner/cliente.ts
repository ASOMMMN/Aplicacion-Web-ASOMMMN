/**
 * Cliente del procesamiento del escáner. Usa el Web Worker y, si no se
 * puede crear o se cae, sigue en el hilo principal con la misma lógica.
 *
 * El flujo nunca se queda colgado:
 * - Si la detección tarda más que `timeoutDeteccionMs`, se termina el
 *   worker (se recrea con la misma foto) y se devuelve el rectángulo de
 *   respaldo para que el usuario ajuste las esquinas a mano.
 * - Si pdf-lib no carga dentro del worker, el PDF se genera en el hilo
 *   principal.
 */
import { CONFIG_ESCANER } from './constantes';
import { rectanguloRespaldo } from './geometria';
import type { OpcionesPdf, PaginaPdf } from './pdf';
import type { ProcesadorEscaner } from './procesador';
import type { ImagenTransferible, RespuestaWorker, SolicitudWorker } from './protocolo';
import type { Cuadrilatero, ModoMejora, ResultadoDeteccion, Rotacion } from './tipos';

/** Distribuye `Omit` sobre cada variante de la unión de solicitudes. */
type SinId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Procesar una página nunca debería tardar tanto; si pasa, se informa en vez de esperar para siempre. */
const TIMEOUT_PROCESAR_MS = 60_000;

export interface ClienteEscaner {
  /** Carga la foto de la página actual (se copia: `imagen` sigue siendo usable). */
  cargar(imagen: ImageData): Promise<void>;
  detectar(): Promise<ResultadoDeteccion>;
  procesar(esquinas: Cuadrilatero, modo: ModoMejora, rotacion: Rotacion): Promise<ImageData>;
  generarPdf(paginas: PaginaPdf[], opciones: OpcionesPdf): Promise<Uint8Array>;
  /** Suelta la foto y la página en caché. */
  liberar(): Promise<void>;
  /** Termina el worker y suelta todo. */
  cerrar(): void;
}

class TiempoAgotado extends Error {}

export function crearClienteEscaner(cfg = CONFIG_ESCANER): ClienteEscaner {
  let worker: Worker | null = null;
  let local: ProcesadorEscaner | null = null;
  let siguienteId = 1;
  const pendientes = new Map<number, { resolver: (r: RespuestaWorker) => void; rechazar: (e: Error) => void }>();
  /** Copia de la foto actual, para recrear el worker o seguir en el hilo principal. */
  let fuente: ImageData | null = null;
  let cerrado = false;

  const crearWorker = (): Worker | null => {
    if (typeof Worker === 'undefined') return null;
    try {
      const w = new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<RespuestaWorker>) => {
        const p = pendientes.get(e.data.id);
        if (!p) return;
        pendientes.delete(e.data.id);
        p.resolver(e.data);
      };
      w.onerror = () => {
        // El script no cargó o reventó: lo pendiente falla y se sigue en el hilo principal.
        descartarWorker(new Error('El procesador se detuvo.'));
      };
      return w;
    } catch {
      return null;
    }
  };

  const descartarWorker = (error: Error) => {
    worker?.terminate();
    worker = null;
    for (const p of pendientes.values()) p.rechazar(error);
    pendientes.clear();
  };

  const obtenerLocal = async (): Promise<ProcesadorEscaner> => {
    if (!local) {
      const { ProcesadorEscaner } = await import('./procesador');
      local = new ProcesadorEscaner();
      if (fuente) local.cargar(fuente);
    }
    return local;
  };

  const enviar = (s: SinId<SolicitudWorker>, transferir: Transferable[] = [], timeoutMs = TIMEOUT_PROCESAR_MS) =>
    new Promise<RespuestaWorker>((resolver, rechazar) => {
      if (!worker) return rechazar(new Error('Sin worker.'));
      const id = siguienteId++;
      const temporizador = setTimeout(() => {
        pendientes.delete(id);
        rechazar(new TiempoAgotado('El procesamiento tardó demasiado.'));
      }, timeoutMs);
      pendientes.set(id, {
        resolver: (r) => {
          clearTimeout(temporizador);
          resolver(r);
        },
        rechazar: (e) => {
          clearTimeout(temporizador);
          rechazar(e);
        },
      });
      worker.postMessage({ ...s, id } as SolicitudWorker, transferir);
    });

  type Exitosa = Extract<RespuestaWorker, { ok: true }>;
  const respuesta = <T extends Exitosa['tipo']>(r: RespuestaWorker, tipo: T) => {
    if (!r.ok) throw new Error(r.error);
    if (r.tipo !== tipo) throw new Error('Respuesta inesperada del procesador.');
    return r as Extract<Exitosa, { tipo: T }>;
  };

  const copiaTransferible = (img: ImageData): ImagenTransferible => ({
    width: img.width,
    height: img.height,
    buffer: img.data.slice().buffer,
  });

  /** Vuelve a levantar el worker con la foto actual (p. ej. tras un timeout). */
  const reiniciarWorker = async () => {
    descartarWorker(new Error('Reiniciado.'));
    if (cerrado) return;
    worker = crearWorker();
    if (worker && fuente) {
      const img = copiaTransferible(fuente);
      await enviar({ tipo: 'cargar', imagen: img }, [img.buffer]).catch(() => undefined);
    }
  };

  worker = crearWorker();

  return {
    async cargar(imagen) {
      fuente = imagen;
      if (local) local.cargar(imagen);
      if (worker) {
        const img = copiaTransferible(imagen);
        try {
          respuesta(await enviar({ tipo: 'cargar', imagen: img }, [img.buffer]), 'cargar');
          return;
        } catch {
          descartarWorker(new Error('Sin worker.'));
        }
      }
      (await obtenerLocal()).cargar(imagen);
    },

    async detectar() {
      const ancho = fuente?.width ?? 1;
      const alto = fuente?.height ?? 1;
      const respaldo: ResultadoDeteccion = {
        esquinas: rectanguloRespaldo(ancho, alto, cfg.margenRespaldo),
        confianza: 0,
        respaldo: true,
      };
      try {
        if (worker) {
          return respuesta(await enviar({ tipo: 'detectar' }, [], cfg.timeoutDeteccionMs), 'detectar').resultado;
        }
        // En el hilo principal no hay forma de cortar un cálculo síncrono: se
        // cede un cuadro para que la interfaz muestre el progreso antes.
        await new Promise((r) => setTimeout(r, 30));
        return (await obtenerLocal()).detectar();
      } catch (err) {
        if (err instanceof TiempoAgotado) void reiniciarWorker();
        return respaldo;
      }
    },

    async procesar(esquinas, modo, rotacion) {
      if (worker) {
        try {
          const r = respuesta(
            await enviar({ tipo: 'procesar', esquinas, modo, rotacion, ladoMax: cfg.ladoMaxSalida }),
            'procesar',
          );
          return new ImageData(new Uint8ClampedArray(r.imagen.buffer), r.imagen.width, r.imagen.height);
        } catch (err) {
          if (err instanceof TiempoAgotado) {
            void reiniciarWorker();
            throw err;
          }
          descartarWorker(err instanceof Error ? err : new Error(String(err)));
        }
      }
      await new Promise((r) => setTimeout(r, 30));
      const img = (await obtenerLocal()).procesar(esquinas, modo, rotacion, cfg.ladoMaxSalida);
      // Las imágenes del procesador siempre se crean sobre un ArrayBuffer propio.
      return new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height);
    },

    async generarPdf(paginas, opciones) {
      if (worker) {
        // Copias: si el worker falla, las originales siguen disponibles para el respaldo.
        const copias = paginas.map((p) => ({ ...p, jpg: p.jpg.slice() }));
        try {
          const r = respuesta(
            await enviar({ tipo: 'pdf', paginas: copias, opciones }, copias.map((p) => p.jpg.buffer)),
            'pdf',
          );
          return new Uint8Array(r.bytes);
        } catch {
          // p. ej. el import dinámico de pdf-lib no está disponible en el worker.
        }
      }
      const { generarPdf } = await import('./pdf');
      return generarPdf(paginas, opciones);
    },

    async liberar() {
      fuente = null;
      local?.liberar();
      if (worker) await enviar({ tipo: 'liberar' }).catch(() => undefined);
    },

    cerrar() {
      cerrado = true;
      fuente = null;
      local?.liberar();
      local = null;
      descartarWorker(new Error('Escáner cerrado.'));
    },
  };
}
