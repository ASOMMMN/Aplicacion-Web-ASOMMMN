import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { S3Service, S3UploadResult } from '../s3/s3.service';

interface DownloadTokenPayload {
  url: string;
  filename: string;
  mime: string;
  exp: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly s3: S3Service,
  ) {}

  async putObject(
    category: string,
    key: string,
    buffer: Buffer,
  ): Promise<S3UploadResult> {
    return this.s3.uploadFile(buffer, key, `asommmn/${category}`);
  }

  async removeObject(key: string): Promise<void> {
    await this.s3.deleteFile(key);
  }

  /** Descarga el contenido desde S3. 404 si el archivo ya no existe ahí. */
  async getObjectBuffer(url: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      this.logger.error(
        `Error al descargar ${url} de S3: ${(err as Error).message}`,
      );
      throw new NotFoundException(
        'El archivo no está disponible en el almacenamiento.',
      );
    }
    if (!res.ok) {
      throw new NotFoundException(
        'El archivo no está disponible en el almacenamiento.',
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * URL de descarga firmada de S3, de corta duración (`ttlSeconds`), generada
   * por S3Service.getSignedUrl. `url` es la URL "canónica" (no firmada) del
   * objeto guardada en BD; aquí se extrae la key para pedir la firma.
   */
  async getSecureDownloadUrl(
    url: string,
    _filename: string,
    _mime: string,
    ttlSeconds = 300,
  ): Promise<string> {
    return this.s3.getSignedUrl(this.extractKeyFromUrl(url), ttlSeconds);
  }

  private extractKeyFromUrl(url: string): string {
    const bucket = this.config.get<string>('AWS_S3_BUCKET', '');
    const region = this.config.get<string>('AWS_REGION', 'us-east-2');
    const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : url;
  }

  private getTokenSecret(): string {
    return this.config.get<string>('JWT_SECRET') ?? '';
  }

  private signDownloadToken(payload: DownloadTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getTokenSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  verifyDownloadToken(token: string): DownloadTokenPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
      throw new UnauthorizedException('Token de descarga inválido.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.getTokenSecret())
      .update(body)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Token de descarga inválido.');
    }

    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as DownloadTokenPayload;

    if (Date.now() > payload.exp) {
      throw new UnauthorizedException('Token de descarga expirado.');
    }

    return payload;
  }
}
