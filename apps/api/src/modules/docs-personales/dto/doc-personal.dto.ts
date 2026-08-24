import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';

export class SubirDocPersonalDto {
  @ApiProperty({
    enum: TIPOS_DOC_PERSONAL,
    description: 'Tipo de documento personal',
    example: 'CURP',
  })
  @IsIn(TIPOS_DOC_PERSONAL)
  tipo: TipoDocPersonal;
}

export class DocPersonalResponseDto {
  @ApiProperty() _id: string;
  @ApiProperty() tipo: TipoDocPersonal;
  @ApiProperty() nombreOriginal: string;
  @ApiProperty() tamanio: number;
  @ApiProperty() tipoMime: string;
  @ApiProperty() subidasEn: Date;
  @ApiPropertyOptional({
    description:
      'Ausente si el archivo es de un almacenamiento anterior (storageType local)',
  })
  urlDescargar?: string;
  @ApiProperty({
    enum: ['local', 'cloudinary'],
    description:
      "'local' = archivo del almacenamiento anterior, ya no disponible; hay que volver a subirlo",
  })
  storageType: 'local' | 'cloudinary';
}

export class ResumenTipoDto {
  @ApiProperty() tipo: TipoDocPersonal;
  @ApiProperty() label: string;
  @ApiProperty() cantidad: number;
  @ApiProperty({ type: [DocPersonalResponseDto] })
  archivos: DocPersonalResponseDto[];
}

export class MisDocsResponseDto {
  @ApiPropertyOptional({ type: [ResumenTipoDto] }) tipos: ResumenTipoDto[];
  @ApiProperty() totalArchivos: number;
  @ApiProperty() tiposConArchivos: number;
}

export class RenombrarDocPersonalDto {
  @ApiProperty({ description: 'Nuevo nombre visible del archivo' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombreOriginal: string;
}
