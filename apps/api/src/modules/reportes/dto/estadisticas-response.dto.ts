import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluadorStatsDto {
  @ApiProperty()
  evaluadorId: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  total: number;

  @ApiPropertyOptional({ nullable: true })
  promedio: number | null;
}

export class EstadisticasResponseDto {
  @ApiProperty()
  usuarios: {
    total: number;
    postulantes: number;
    evaluadores: number;
    administradores: number;
    activos: number;
  };

  @ApiProperty()
  postulantes: {
    total: number;
    enProceso: number;
    completados: number;
    rechazados: number;
    conCV: number;
    sinCV: number;
  };

  @ApiProperty()
  evaluaciones: {
    total: number;
    promedioCalificacion: number | null;
    porEvaluador: EvaluadorStatsDto[];
  };

  @ApiProperty()
  documentos: {
    total: number;
    ultimoMes: number;
  };
}
