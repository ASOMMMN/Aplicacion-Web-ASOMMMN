import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import {
  CloudinaryService,
  CloudinaryUploadResult,
} from '../cloudinary/cloudinary.service';

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
    private readonly cloudinary: CloudinaryService,
  ) {}

  async putObject(
    category: string,
    key: string,
    buffer: Buffer,
  ): Promise<CloudinaryUploadResult> {
    return this.cloudinary.uploadFile(buffer, key, `asommmn/${category}`);
  }

  async removeObject(publicId: string): Promise<void> {
    await this.cloudinary.deleteFile(publicId);
  }

  /** Descarga el contenido desde Cloudinary. 404 si el archivo ya no existe ahí. */
  async getObjectBuffer(url: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      this.logger.error(
        `Error al descargar ${url} de Cloudinary: ${(err as Error).message}`,
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
   * URL de descarga autenticada por token firmado (HMAC) y de corta duración —
   * el token envuelve la URL real de Cloudinary y expira a los `ttlSeconds`
   * segundos, evitando exponer URLs de Cloudinary permanentes sin control.
   */
  getSecureDownloadUrl(
    cloudinaryUrl: string,
    filename: string,
    mime: string,
    ttlSeconds = 300,
  ): string {
    const port = this.config.get<number>('PORT', 3001);
    const base = this.config
      .get<string>('BACKEND_PUBLIC_URL', `http://localhost:${port}`)
      .replace(/\/$/, '');
    const token = this.signDownloadToken({
      url: cloudinaryUrl,
      filename,
      mime,
      exp: Date.now() + ttlSeconds * 1000,
    });
    return `${base}/files/download?token=${encodeURIComponent(token)}`;
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
