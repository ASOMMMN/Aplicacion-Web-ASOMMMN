/**
 * Compresión adaptativa de las páginas a JPEG: empieza en `calidadJpeg` y,
 * mientras el total pase de `tamanoObjetivoBytes`, baja la calidad hasta
 * `calidadMinima`; después reduce el tamaño de las páginas sin bajar de
 * `ladoMinLegible`. Si ni así se alcanza el objetivo, se acepta el
 * resultado más chico: la legibilidad manda sobre el peso.
 *
 * El codificador se inyecta (canvas en el navegador, otro en las pruebas).
 */
import { CONFIG_ESCANER } from './constantes';

export interface DimensionesPagina {
  width: number;
  height: number;
}

/** Codifica `pagina` a JPEG con `calidad` (0–1), reducida por `escala` (≤ 1). */
export type CodificadorJpeg<P> = (
  pagina: P,
  calidad: number,
  escala: number,
) => Promise<Uint8Array>;

export interface ConfigCompresion {
  calidadJpeg: number;
  calidadMinima: number;
  pasoCalidad: number;
  factorReduccion: number;
  ladoMinLegible: number;
  tamanoObjetivoBytes: number;
}

export interface ResultadoCompresion {
  jpgs: Uint8Array[];
  calidad: number;
  escalas: number[];
  totalBytes: number;
  dentroDelObjetivo: boolean;
  intentos: number;
}

/** Bytes aproximados que agrega el PDF por página (objetos, xref). */
const SOBRECARGA_PDF_POR_PAGINA = 1024;
const MAX_INTENTOS = 12;

export async function comprimirPaginas<P extends DimensionesPagina>(
  paginas: readonly P[],
  codificar: CodificadorJpeg<P>,
  cfg: ConfigCompresion = CONFIG_ESCANER,
  alAvanzar?: (intento: number) => void,
): Promise<ResultadoCompresion> {
  let calidad = cfg.calidadJpeg;
  const escalas = paginas.map(() => 1);
  let mejor: ResultadoCompresion | null = null;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    alAvanzar?.(intento);
    const jpgs: Uint8Array[] = [];
    for (let i = 0; i < paginas.length; i++) {
      jpgs.push(await codificar(paginas[i], calidad, escalas[i]));
    }
    const totalBytes =
      jpgs.reduce((s, j) => s + j.byteLength, 0) +
      SOBRECARGA_PDF_POR_PAGINA * paginas.length;
    const resultado: ResultadoCompresion = {
      jpgs,
      calidad,
      escalas: [...escalas],
      totalBytes,
      dentroDelObjetivo: totalBytes <= cfg.tamanoObjetivoBytes,
      intentos: intento,
    };
    if (!mejor || totalBytes < mejor.totalBytes) mejor = resultado;
    if (resultado.dentroDelObjetivo) return resultado;

    const siguienteCalidad = redondear(calidad - cfg.pasoCalidad);
    if (siguienteCalidad >= cfg.calidadMinima - 1e-9) {
      calidad = siguienteCalidad;
      continue;
    }
    calidad = cfg.calidadMinima;
    let reducida = false;
    paginas.forEach((p, i) => {
      const lado = Math.max(p.width, p.height);
      const nueva = escalas[i] * cfg.factorReduccion;
      const minima = Math.min(1, cfg.ladoMinLegible / lado);
      const escala = Math.max(nueva, minima);
      if (escala < escalas[i] - 1e-6) {
        escalas[i] = escala;
        reducida = true;
      }
    });
    if (!reducida) break;
  }
  return { ...mejor!, intentos: Math.min(MAX_INTENTOS, mejor!.intentos) };
}

const redondear = (v: number) => Math.round(v * 100) / 100;
