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
    /** Total de cuentas activas (excluye eliminadas; ver `eliminados`). */
    total: number;
    postulantes: number;
    evaluadores: number;
    administradores: number;
    activos: number;
    /** Cuentas con soft-delete (isDeleted:true). No incluidas en `total` ni en el desglose por rol. */
    eliminados: number;
  };

  @ApiProperty()
  postulantes: {
    /** Total de candidatos activos (excluye eliminados; ver `eliminados`). */
    total: number;
    enProceso: number;
    completados: number;
    rechazados: number;
    conCV: number;
    sinCV: number;
    /** Candidatos eliminados (cuenta propia o del usuario borrada, incluye legado). */
    eliminados: number;
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
