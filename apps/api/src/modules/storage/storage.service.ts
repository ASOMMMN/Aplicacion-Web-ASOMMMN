import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';
import * as crypto from 'node:crypto';

interface DownloadTokenPayload {
  cat: string;
  key: string;
  filename: string;
  mime: string;
  exp: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    this.baseDir = this.config.get<string>('STORAGE_PATH', join(process.cwd(), 'uploads'));
  }

  async onModuleInit() {
    await mkdir(this.baseDir, { recursive: true });
    this.logger.log(`Almacenamiento en disco: ${this.baseDir}`);
  }

  resolveFilePath(category: string, key: string): string {
    const safeCat = category.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeKey = key
      .replace(/\\/g, '/')
      .split('/')
      .filter((p) => p && p !== '..' && p !== '.')
      .join('/');
    return join(this.baseDir, safeCat, safeKey);
  }

  async putObject(category: string, key: string, buffer: Buffer, _mime?: string): Promise<void> {
    const filePath = this.resolveFilePath(category, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  async getObject(category: string, key: string): Promise<Buffer> {
    return readFile(this.resolveFilePath(category, key));
  }

  async removeObject(category: string, key: string): Promise<void> {
    await rm(this.resolveFilePath(category, key), { force: true });
  }

  async objectExists(category: string, key: string): Promise<boolean> {
    try {
      await access(this.resolveFilePath(category, key), fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * URL de descarga autenticada por token firmado (HMAC) y de corta duración —
   * evita servir archivos como estáticos públicos permanentes. El token va
   * firmado con JWT_SECRET y expira a los `ttlSeconds` segundos.
   */
  getSecureDownloadUrl(
    category: string,
    key: string,
    filename: string,
    mime: string,
    ttlSeconds = 300,
  ): string {
    const port = this.config.get<number>('PORT', 3001);
    const base = this.config
      .get<string>('BACKEND_PUBLIC_URL', `http://localhost:${port}`)
      .replace(/\/$/, '');
    const token = this.signDownloadToken(
      { cat: category, key, filename, mime, exp: Date.now() + ttlSeconds * 1000 },
    );
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
      throw new BadRequestException('Token de descarga inválido.');
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
      throw new BadRequestException('Token de descarga inválido.');
    }

    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as DownloadTokenPayload;

    if (Date.now() > payload.exp) {
      throw new BadRequestException('Token de descarga expirado.');
    }

    return payload;
  }
}
