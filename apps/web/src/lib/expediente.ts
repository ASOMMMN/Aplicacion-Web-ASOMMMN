/**
 * Requeridos vs. opcionales de los documentos personales, igual que la API
 * (apps/api/src/modules/postulantes/constants/expediente.constants.ts y
 * utils/progreso-expediente.util.ts): los opcionales no cuentan para el
 * avance y solo se evalúan si el postulante subió el archivo.
 */
export const TIPOS_DOC_PERSONAL_OPCIONALES: readonly string[] = [
  'visa',
  'vacuna_fiebre_amarilla',
  'refrendo',
];

export const esTipoDocOpcional = (tipo: string) =>
  TIPOS_DOC_PERSONAL_OPCIONALES.includes(tipo);

/**
 * "X/Y tipos entregados": X cuenta solo requeridos con al menos un archivo,
 * así que nunca supera Y (antes los opcionales sumaban al numerador: "9/8").
 */
export function contarTiposEntregados(
  tiposConocidos: readonly string[],
  entregados: readonly { tipo: string; cantidad: number }[],
): { entregados: number; total: number } {
  const requeridos = tiposConocidos.filter((t) => !esTipoDocOpcional(t));
  const conArchivo = new Set(entregados.filter((e) => e.cantidad > 0).map((e) => e.tipo));
  return {
    entregados: requeridos.filter((t) => conArchivo.has(t)).length,
    total: requeridos.length,
  };
}

/** Un documento se puede evaluar si es requerido, o si es opcional y se subió. */
export const esDocEvaluable = (tipo: string, cantidad: number) =>
  !esTipoDocOpcional(tipo) || cantidad > 0;
