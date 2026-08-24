import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Descarga autenticada por token firmado de corta duración (ver
   * StorageService.getSecureDownloadUrl). El token envuelve la URL real del
   * archivo en Cloudinary; aquí solo se verifica y se redirige — el archivo
   * nunca se lee ni se sirve desde disco local.
   */
  @Get('download')
  async download(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const payload = this.storage.verifyDownloadToken(token ?? '');

    let head: globalThis.Response;
    try {
      head = await fetch(payload.url, { method: 'HEAD' });
    } catch {
      throw new NotFoundException('El archivo no está disponible.');
    }
    if (!head.ok) {
      throw new NotFoundException('El archivo no está disponible.');
    }

    res.redirect(302, payload.url);
  }
}
