export const REQUISITOS_EXPEDIENTE = [
  { clave: 'cv', label: 'Currículum Vitae', urlFrontend: '/mi-cv' },
  { clave: 'CURP', label: 'CURP', urlFrontend: '/mis-docs-personales' },
  {
    clave: 'INE',
    label: 'INE / Credencial de elector',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'acta_nacimiento',
    label: 'Acta de nacimiento',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'pasaporte',
    label: 'Pasaporte',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'vacuna_fiebre_amarilla',
    label: 'Vacuna de fiebre amarilla',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'constancia_participacion',
    label: 'Constancia de participación',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'certificado_medico',
    label: 'Certificado médico',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'libreta_identidad_maritima',
    label: 'Libreta de identidad marítima',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'certificado_competencia',
    label: 'Certificado de competencia',
    urlFrontend: '/mis-docs-personales',
  },
  {
    clave: 'vacante',
    label: 'Vacante (puesto al que aplicas)',
    urlFrontend: '/mi-perfil',
  },
] as const;

export type ClaveRequisito = (typeof REQUISITOS_EXPEDIENTE)[number]['clave'];

export const CLAVES_REQUISITO = REQUISITOS_EXPEDIENTE.map((r) => r.clave);

/**
 * Si el % de avance cayó por debajo de 100 (ej. se agregaron nuevos requisitos
 * obligatorios después de que el postulante ya había enviado su expediente),
 * el estado guardado 'enviado' ya no es válido y debe tratarse como 'en_proceso'.
 */
export function resolverEstadoExpediente(
  porcentaje: number,
  estadoGuardado: 'en_proceso' | 'enviado',
): 'en_proceso' | 'enviado' {
  return porcentaje < 100 && estadoGuardado === 'enviado'
    ? 'en_proceso'
    : estadoGuardado;
}

export function calcularSemaforo(
  tieneCV: boolean,
  tieneVacante: boolean,
  porcentaje: number,
  estadoExpediente: 'en_proceso' | 'enviado',
): 'verde' | 'amarillo' | 'rojo' {
  if (estadoExpediente === 'enviado' || porcentaje === 100) return 'verde';
  if (tieneCV && tieneVacante) return 'amarillo';
  return 'rojo';
}
