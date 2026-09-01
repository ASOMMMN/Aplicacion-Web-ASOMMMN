import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequisitoItemDto {
  @ApiProperty() clave: string;
  @ApiProperty() label: string;
  @ApiProperty() cumplido: boolean;
  @ApiProperty() urlFrontend: string;
  @ApiProperty() requerido: boolean;
}

export class ExpedienteProgressDto {
  @ApiProperty() porcentaje: number;
  @ApiProperty() total: number;
  @ApiProperty() cumplidos: number;
  @ApiProperty({ type: [RequisitoItemDto] }) requisitos: RequisitoItemDto[];
  @ApiProperty({ enum: ['en_proceso', 'enviado'] }) estadoExpediente:
    | 'en_proceso'
    | 'enviado';
  @ApiProperty() puedeEnviar: boolean;
  @ApiPropertyOptional() enviadoEn?: Date;
}
