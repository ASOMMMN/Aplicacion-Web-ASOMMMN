export const TIPOS_DOC_PERSONAL = [
  'CURP',
  'INE',
  'acta_nacimiento',
  'visa',
  'pasaporte',
  'vacuna_fiebre_amarilla',
  'constancia_participacion',
  'certificado_medico',
  'libreta_identidad_maritima',
  'certificado_competencia',
] as const;

export type TipoDocPersonal = (typeof TIPOS_DOC_PERSONAL)[number];

/**
 * Tipos que no tienen vencimiento: en el resumen de fechas se muestran como
 * "No aplica". Cualquier tipo que NO esté aquí y no tenga fecha se muestra
 * como "Sin fecha" (dato faltante), nunca como "No aplica".
 *
 * - CURP y acta de nacimiento: no vencen.
 * - Vacuna de fiebre amarilla: desde 2016 la OMS considera el certificado
 *   válido de por vida, aunque uno antiguo indique vencimiento.
 * - constancia_participacion queda fuera a propósito (dudoso → "Sin fecha").
 */
export const TIPOS_DOC_SIN_VENCIMIENTO: readonly TipoDocPersonal[] = [
  'CURP',
  'acta_nacimiento',
  'vacuna_fiebre_amarilla',
];

export const LABEL_TIPO_DOC: Record<TipoDocPersonal, string> = {
  CURP: 'CURP',
  INE: 'INE',
  acta_nacimiento: 'Acta de nacimiento',
  visa: 'Visa',
  pasaporte: 'Pasaporte',
  vacuna_fiebre_amarilla: 'Vacuna de fiebre amarilla',
  constancia_participacion: 'Constancia de participación',
  certificado_medico: 'Certificado médico',
  libreta_identidad_maritima: 'Libreta de identidad marítima',
  certificado_competencia: 'Certificado de competencia',
};
