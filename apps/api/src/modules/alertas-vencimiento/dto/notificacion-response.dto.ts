import { ApiProperty } from '@nestjs/swagger';

export class NotificacionItemDto {
  @ApiProperty() _id: string;
  @ApiProperty() tipo: string;
  @ApiProperty() candidatoId: string;
  @ApiProperty() cursoId: string;
  @ApiProperty() nombreCandidato: string;
  @ApiProperty() nombreCurso: string;
  @ApiProperty() fechaVencimiento: Date;
  @ApiProperty() diasAnticipacion: number;
  @ApiProperty() diasRestantes: number;
  @ApiProperty() leida: boolean;
  @ApiProperty() fechaCreacion: Date;
}

export class ContadorNoLeidasDto {
  @ApiProperty() count: number;
}

export class RevisionVencimientosDto {
  @ApiProperty() creadas: number;
}
