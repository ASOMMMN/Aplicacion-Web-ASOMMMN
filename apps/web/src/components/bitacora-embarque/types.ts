export interface DuracionEmbarque {
  anios: number;
  meses: number;
  dias: number;
  totalDias: number;
}

export interface TiempoTotalMar {
  anios: number;
  meses: number;
  totalDias: number;
}

export interface EmbarqueItem {
  _id: string;
  fechaEmbarco: string;
  fechaDesembarco: string;
  naviera: string;
  nombreNave: string;
  tipoMaquina: string;
  potenciaKW: number;
  tipoNave: string;
  rango: string;
  bandera: string;
  duracion: DuracionEmbarque;
  creadoEn: string;
}

export interface BitacoraEmbarqueResponse {
  postulante: { id: string; nombreCompleto: string; email: string };
  embarques: EmbarqueItem[];
  total: number;
  tiempoTotal: TiempoTotalMar;
}

export interface EmbarqueFormValues {
  fechaEmbarco: string;
  fechaDesembarco: string;
  naviera: string;
  nombreNave: string;
  tipoMaquina: string;
  potenciaKW: string;
  tipoNave: string;
  tipoNaveOtro: string;
  rango: string;
  bandera: string;
}

export const TIPOS_NAVE_COMUNES = [
  'Petrolero',
  'Quimiquero',
  'Gasero (LPG/LNG)',
  'Carga general',
  'Granelero',
  'Portacontenedores',
  'Buque tanque',
  'Remolcador',
  'Pesquero',
  'Ferry / Pasaje',
  'Offshore / Plataforma',
  'Otro',
] as const;

export const EMBARQUE_FORM_VACIO: EmbarqueFormValues = {
  fechaEmbarco: '',
  fechaDesembarco: '',
  naviera: '',
  nombreNave: '',
  tipoMaquina: '',
  potenciaKW: '',
  tipoNave: '',
  tipoNaveOtro: '',
  rango: '',
  bandera: '',
};
