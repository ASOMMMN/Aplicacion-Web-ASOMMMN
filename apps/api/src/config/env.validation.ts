import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  PORT: number = 3001;

  @IsString()
  MONGODB_URI!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  JWT_REFRESH_SECRET: string = '';

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsOptional()
  @IsString()
  STORAGE_PATH: string = '';

  @IsOptional()
  @IsString()
  BACKEND_PUBLIC_URL: string = '';

  @IsOptional()
  @IsString()
  RESEND_API_KEY: string = '';

  @IsOptional()
  @IsString()
  RESEND_FROM: string = '';

  @IsOptional()
  @IsString()
  FRONTEND_URL: string = '';

  @IsOptional()
  @IsString()
  ADMIN_EMAIL: string = '';

  @IsOptional()
  @IsString()
  ADMIN_PASSWORD: string = '';

  @IsOptional()
  @IsString()
  ADMIN_NOMBRE: string = 'Administrador';

  @IsOptional()
  @IsString()
  ADMIN_APELLIDOS: string = 'Sistema';

  @IsOptional()
  @IsString()
  EMAIL_VERIFICATION_REQUIRED: string = 'false';

  @IsOptional()
  @IsString()
  ENABLE_TEST_ENDPOINTS: string = 'false';

  @IsOptional()
  @IsString()
  OPENAI_API_KEY: string = '';

  @IsOptional()
  @IsString()
  OPENAI_MODEL: string = 'gpt-4o-mini';

  @IsOptional()
  @IsString()
  CHATBOT_WHATSAPP_NUMERO: string = '';

  @IsString()
  CLOUDINARY_CLOUD_NAME!: string;

  @IsString()
  CLOUDINARY_API_KEY!: string;

  @IsString()
  CLOUDINARY_API_SECRET!: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
