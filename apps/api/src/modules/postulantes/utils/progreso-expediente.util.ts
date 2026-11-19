import { REQUISITOS_EXPEDIENTE } from '../constants/expediente.constants';

/**
 * Única definición de "qué cuenta" en el expediente de un candidato. La usan
 * el panel del postulante, la lista y el detalle del evaluador y la
 * sincronización del estado enviado, para que los contadores coincidan.
 *
 * - Requeridos (`requerido: true`, incluye `cv` y `vacante`): son el % de
 *   avance y la lista "Falta: ...". Siempre son evaluables.
 * - Opcionales (`requerido: false`: vacuna, visa, refrendo): no cuentan para
 *   el avance; son evaluables solo si el postulante entregó el archivo.
 * - "Docs. evaluados" = evaluables con al menos una evaluación / evaluables.
 *   Nunca supera el total: una evaluación de un opcional que ya no tiene
 *   archivo, o de una clave que no es requisito, no suma.
 */
export interface EntradaProgresoExpediente {
  /** Tipos de documento personal con al menos un archivo. */
  tiposEntregados: Iterable<string>;
  tieneCV: boolean;
  tieneVacante: boolean;
  /** Claves (`documentoClave`) con al menos una evaluación. */
  clavesEvaluadas?: Iterable<string>;
}

export interface ProgresoExpediente {
  /** Claves cumplidas (requeridas u opcionales). */
  cumplidos: Set<string>;
  requeridosTotal: number;
  requeridosCumplidos: number;
  /** 0–100, solo requeridos. */
  porcentajeExpediente: number;
  /** Etiquetas de los requeridos que faltan, en el orden de REQUISITOS_EXPEDIENTE. */
  requisitosFaltantes: string[];
  /** Claves que se pueden evaluar: requeridos + opcionales entregados. */
  clavesEvaluables: string[];
  docsTotal: number;
  docsEvaluados: number;
}

export function calcularProgresoExpediente(
  entrada: EntradaProgresoExpediente,
): ProgresoExpediente {
  const cumplidos = new Set<string>(entrada.tiposEntregados);
  if (entrada.tieneCV) cumplidos.add('cv');
  if (entrada.tieneVacante) cumplidos.add('vacante');

  const requeridos = REQUISITOS_EXPEDIENTE.filter((r) => r.requerido);
  const faltantes = requeridos.filter((r) => !cumplidos.has(r.clave));
  const requeridosCumplidos = requeridos.length - faltantes.length;

  const clavesEvaluables: string[] = REQUISITOS_EXPEDIENTE.filter(
    (r) => r.requerido || cumplidos.has(r.clave),
  ).map((r) => r.clave);

  const evaluadas = new Set(entrada.clavesEvaluadas ?? []);
  const docsEvaluados = clavesEvaluables.filter((c) => evaluadas.has(c)).length;

  return {
    cumplidos,
    requeridosTotal: requeridos.length,
    requeridosCumplidos,
    porcentajeExpediente: Math.round(
      (requeridosCumplidos / requeridos.length) * 100,
    ),
    requisitosFaltantes: faltantes.map((r) => r.label),
    clavesEvaluables,
    docsTotal: clavesEvaluables.length,
    docsEvaluados,
  };
}
