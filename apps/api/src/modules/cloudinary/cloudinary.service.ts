import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  /**
   * Sube el buffer con resource_type 'raw' (en vez de 'auto'/'image'): las
   * cuentas nuevas de Cloudinary restringen por defecto la entrega de PDFs
   * subidos como 'image' (protección anti-abuso), lo que causaría 401 al
   * descargar. 'raw' sirve cualquier archivo tal cual, sin esa restricción.
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    folder: string,
  ): Promise<CloudinaryUploadResult> {
    const publicId = `${folder}/${filename}`;
    this.logger.log(
      `>>> INICIANDO UPLOAD a Cloudinary: ${publicId} (bytes=${buffer?.length ?? 'undefined'})`,
    );
    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `>>> ERROR al subir ${publicId} a Cloudinary: ${JSON.stringify(error) ?? 'desconocido'}`,
            );
            reject(
              new BadRequestException(
                'No se pudo subir el archivo al almacenamiento. Inténtalo de nuevo.',
              ),
            );
            return;
          }
          this.logger.log(
            `>>> UPLOAD OK a Cloudinary: publicId=${result.public_id} url=${result.secure_url} bytes=${result.bytes} resourceType=${result.resource_type}`,
          );
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (err) {
      this.logger.warn(
        `No se pudo eliminar ${publicId} de Cloudinary: ${(err as Error).message}`,
      );
    }
  }
}
