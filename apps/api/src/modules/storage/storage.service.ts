import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

  getDownloadUrl(category: string, key: string): string {
    const port = this.config.get<number>('PORT', 3001);
    const base = this.config
      .get<string>('BACKEND_PUBLIC_URL', `http://localhost:${port}`)
      .replace(/\/$/, '');
    const safeCat = encodeURIComponent(category.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const encodedKey = key
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `${base}/uploads/${safeCat}/${encodedKey}`;
  }

  /** Alias for backward compat — expiry param is ignored with disk storage */
  getPresignedUrl(category: string, key: string, _expiry?: number): Promise<string> {
    return Promise.resolve(this.getDownloadUrl(category, key));
  }
}
