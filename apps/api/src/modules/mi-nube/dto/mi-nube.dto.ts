import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearCarpetaNubeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class RenombrarDocumentoNubeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;
}

export class MoverDocumentoNubeDto {
  @IsOptional()
  @IsMongoId()
  parentId?: string | null;
}
