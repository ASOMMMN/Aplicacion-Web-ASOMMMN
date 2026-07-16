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
