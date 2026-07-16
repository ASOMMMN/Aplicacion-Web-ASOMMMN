import { IsEmail, IsString, Length } from 'class-validator';

export class EnrollMFADto {
  @IsEmail()
  email: string;
}

export class VerifyMFAEnrollDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  codigo: string;

  @IsString()
  @Length(10)
  passwordTemporal?: string;
}

export class VerifyMFALoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  codigo: string;
}

export class UseMFARecoveryCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  codigoRecuperacion: string;
}

export class GenerateMFARecoveryCodesDto {
  @IsString()
  password: string;
}

export class DisableMFADto {
  @IsString()
  password: string;
}
