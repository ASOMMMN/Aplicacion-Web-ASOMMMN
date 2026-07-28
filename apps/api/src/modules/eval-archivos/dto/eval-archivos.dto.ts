import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsMongoId,
} from 'class-validator';

export class CrearCarpetaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class MoverArchivoDto {
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class RenombrarArchivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;
}

export class BuscarArchivosDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
