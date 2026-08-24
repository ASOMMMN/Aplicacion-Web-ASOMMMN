import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearCarpetaDto {
  @ApiProperty({ example: 'Certificados 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @ApiPropertyOptional({ description: 'ID de carpeta padre' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @ApiPropertyOptional({
    enum: ['cv', 'curso', 'certificacion', 'otro'],
    default: 'otro',
  })
  @IsOptional()
  @IsIn(['cv', 'curso', 'certificacion', 'otro'])
  categoria?: 'cv' | 'curso' | 'certificacion' | 'otro';
}

export class SubirDocumentoNubeDto {
  @ApiPropertyOptional({ description: 'ID de carpeta padre' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @ApiPropertyOptional({
    enum: ['cv', 'curso', 'certificacion', 'otro'],
    default: 'otro',
  })
  @IsOptional()
  @IsIn(['cv', 'curso', 'certificacion', 'otro'])
  categoria?: 'cv' | 'curso' | 'certificacion' | 'otro';

  @ApiPropertyOptional({ description: 'Nombre personalizado del archivo' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nombre?: string;

  @ApiPropertyOptional({
    description:
      'Si el curso aparece en CV (solo categoría curso/certificación)',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  apareceEnCV?: boolean;
}

export class RenombrarNubeItemDto {
  @ApiProperty({ example: 'Nuevo nombre' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nombre: string;
}

export class CambiarCategoriaNubeItemDto {
  @ApiProperty({ enum: ['cv', 'curso', 'certificacion', 'otro'] })
  @IsIn(['cv', 'curso', 'certificacion', 'otro'])
  categoria: 'cv' | 'curso' | 'certificacion' | 'otro';
}

export class MoverNubeItemDto {
  @ApiPropertyOptional({ description: 'ID de carpeta destino; null para raíz' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class NubeItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty({ enum: ['archivo', 'carpeta'] })
  tipo: 'archivo' | 'carpeta';

  @ApiProperty({ enum: ['cv', 'curso', 'certificacion', 'otro'] })
  categoria: 'cv' | 'curso' | 'certificacion' | 'otro';

  @ApiPropertyOptional()
  parentId?: string | null;

  @ApiPropertyOptional()
  mimeType?: string;

  @ApiPropertyOptional()
  tamanio?: number;

  @ApiProperty()
  creadoEn: Date;

  @ApiProperty()
  actualizadoEn: Date;

  @ApiPropertyOptional()
  downloadUrl?: string;

  @ApiPropertyOptional({
    enum: ['local', 'cloudinary'],
    description:
      "'local' = archivo del almacenamiento anterior, ya no disponible; hay que volver a subirlo",
  })
  storageType?: 'local' | 'cloudinary';
}

export class ListarMiNubeQueryDto {
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @IsOptional()
  @IsIn(['cv', 'curso', 'certificacion', 'otro'])
  categoria?: 'cv' | 'curso' | 'certificacion' | 'otro';
}

export class NubeListadoResponseDto {
  @ApiProperty({ type: [NubeItemResponseDto] })
  items: NubeItemResponseDto[];

  @ApiProperty()
  parentId: string | null;
}
