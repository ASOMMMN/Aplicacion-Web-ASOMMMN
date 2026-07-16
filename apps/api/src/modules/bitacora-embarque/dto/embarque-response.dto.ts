export class DuracionResponseDto {
  anios: number;
  meses: number;
  dias: number;
  totalDias: number;
}

export class EmbarqueItemResponseDto {
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
  duracion: DuracionResponseDto;
  creadoEn: string;
}

export class TiempoTotalResponseDto {
  anios: number;
  meses: number;
  totalDias: number;
}

export class BitacoraEmbarqueListResponseDto {
  postulante: {
    id: string;
    nombreCompleto: string;
    email: string;
  };
  embarques: EmbarqueItemResponseDto[];
  total: number;
  tiempoTotal: TiempoTotalResponseDto;
}
