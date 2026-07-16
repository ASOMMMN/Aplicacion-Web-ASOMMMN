import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmbarqueDto {
  @IsDateString()
  fechaEmbarco: string;

  @IsDateString()
  fechaDesembarco: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  naviera: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombreNave: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tipoMaquina: string;

  @IsNumber()
  @Min(0)
  @Max(200_000)
  potenciaKW: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tipoNave: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  rango: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  bandera: string;
}
