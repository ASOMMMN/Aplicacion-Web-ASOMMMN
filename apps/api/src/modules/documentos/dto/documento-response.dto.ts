import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DocumentoResponseDto {
  @ApiProperty()
  declare _id: string;

  @ApiProperty()
  declare nombreOriginal: string;

  @ApiProperty()
  declare tamanio: number;

  @ApiProperty()
  declare version: number;

  @ApiProperty()
  declare esActual: boolean;

  @ApiProperty()
  declare subidasEn: Date;

  @ApiProperty()
  subidasPor?: string;
}

export class DocumentoActualResponseDto {
  @ApiProperty()
  declare _id: string;

  @ApiProperty()
  declare nombreOriginal: string;

  @ApiProperty()
  declare tamanio: number;

  @ApiProperty()
  declare version: number;

  @ApiProperty()
  declare subidasEn: Date;

  @ApiProperty()
  declare urlDescargar: string;
}

export class HistorialDocumentosResponseDto {
  @ApiProperty({ type: [DocumentoResponseDto] })
  declare documentos: DocumentoResponseDto[];

  @ApiProperty()
  declare total: number;
}

export class RenombrarDocumentoDto {
  @ApiProperty({ description: 'Nuevo nombre visible del archivo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombreOriginal: string;
}
