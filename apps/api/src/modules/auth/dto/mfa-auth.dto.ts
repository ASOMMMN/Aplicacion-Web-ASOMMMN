import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerificarMfaLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tempSessionToken: string;

  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  codigo?: string;

  @ApiProperty({ required: false, example: 'ABCD1234' })
  @IsOptional()
  @IsString()
  codigoRecuperacion?: string;
}

export class IniciarSetupMfaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tempSessionToken: string;
}

export class ActivarMfaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tempSessionToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  codigo: string;
}
