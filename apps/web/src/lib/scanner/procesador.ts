/**
 * Estado y lógica del procesamiento de UNA página: la foto fuente, la
 * detección y la página enderezada en caché (cambiar de modo o rotar no
 * vuelve a enderezar). Lo usa el Web Worker y, si el navegador no puede
 * crear el worker, el hilo principal.
 */
import { detectarBordes, type OpcionesDeteccion } from './deteccion';
import { rotarImagen } from './imagen';
import { mejorarImagen } from './mejora';
import type { Cuadrilatero, ImagenRGBA, ModoMejora, ResultadoDeteccion, Rotacion } from './tipos';
import { corregirPerspectiva } from './warp';

export class ProcesadorEscaner {
  private fuente: ImagenRGBA | null = null;
  private enderezada: { clave: string; imagen: ImagenRGBA } | null = null;

  cargar(imagen: ImagenRGBA): void {
    this.fuente = imagen;
    this.enderezada = null;
  }

  detectar(opciones?: Partial<OpcionesDeteccion>): ResultadoDeteccion {
    return detectarBordes(this.requerirFuente(), opciones);
  }

  procesar(
    esquinas: Cuadrilatero,
    modo: ModoMejora,
    rotacion: Rotacion,
    ladoMax: number,
  ): ImagenRGBA {
    const fuente = this.requerirFuente();
    const clave = `${ladoMax}:${esquinas.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')}`;
    if (this.enderezada?.clave !== clave) {
      this.enderezada = { clave, imagen: corregirPerspectiva(fuente, esquinas, ladoMax) };
    }
    return rotarImagen(mejorarImagen(this.enderezada.imagen, modo), rotacion);
  }

  liberar(): void {
    this.fuente = null;
    this.enderezada = null;
  }

  private requerirFuente(): ImagenRGBA {
    if (!this.fuente) throw new Error('No hay imagen cargada.');
    return this.fuente;
  }
}
