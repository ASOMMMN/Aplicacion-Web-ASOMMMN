import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Descarga autenticada por token firmado de corta duración (ver
   * StorageService.getSecureDownloadUrl). Reemplaza el antiguo servido
   * estático de /uploads, que exponía cualquier archivo sin autenticación
   * a quien conociera o adivinara la ruta.
   */
  @Get('download')
  async download(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const payload = this.storage.verifyDownloadToken(token ?? '');
    const buffer = await this.storage.getObject(payload.cat, payload.key);

    res.setHeader('Content-Type', payload.mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(payload.filename)}"`,
    );
    res.send(buffer);
  }
}
