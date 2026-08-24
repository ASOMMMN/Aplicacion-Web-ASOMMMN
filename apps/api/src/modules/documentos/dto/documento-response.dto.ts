import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({
    description:
      'Ausente si el archivo es de un almacenamiento anterior (storageType local)',
  })
  declare urlDescargar?: string;

  @ApiProperty({
    enum: ['local', 'cloudinary'],
    description:
      "'local' = archivo del almacenamiento anterior, ya no disponible; hay que volver a subirlo",
  })
  declare storageType: 'local' | 'cloudinary';
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
