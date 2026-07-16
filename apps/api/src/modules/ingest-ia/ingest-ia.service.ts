import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import {
  Extraccion,
  ExtraccionDocument,
  DatosCV,
} from './schemas/extraccion.schema';
import { OpenAiIaService } from './openai-ia.service';
import { StorageService } from '../storage/storage.service';
import {
  Documento,
  DocumentoDocument,
} from '../documentos/schemas/documento.schema';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class IngestIaService {
  private readonly logger = new Logger(IngestIaService.name);

  constructor(
    @InjectModel(Extraccion.name)
    private extraccionModel: Model<ExtraccionDocument>,
    @InjectModel(Documento.name)
    private documentoModel: Model<DocumentoDocument>,
    private openAiIa: OpenAiIaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  async procesar(postulanteId: string): Promise<ExtraccionDocument> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY no configurada. Configura la variable de entorno en el servidor.',
      );
    }

    const documento = await this.documentoModel.findOne({
      postulanteId: new Types.ObjectId(postulanteId),
      esActual: true,
    });

    if (!documento) {
      throw new NotFoundException(
        'Este postulante no tiene CV cargado. Pide que suba su CV primero.',
      );
    }

    // Marcar cualquier propuesta anterior como rechazada para empezar limpio
    await this.extraccionModel.updateMany(
      { postulanteId: new Types.ObjectId(postulanteId), estado: 'propuesto' },
      { $set: { estado: 'rechazado' } },
    );

    const extraccion = await this.extraccionModel.create({
      postulanteId: new Types.ObjectId(postulanteId),
      documentoId: documento._id,
      estado: 'propuesto',
      modeloUsado: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
    });

    // Procesar en background sin bloquear la respuesta
    this.procesarAsync(extraccion, documento).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error procesando extracción ${extraccion._id.toString()}: ${msg}`,
      );
    });

    return extraccion;
  }

  private async procesarAsync(
    extraccion: ExtraccionDocument,
    documento: DocumentoDocument,
  ): Promise<void> {
    try {
      const [category, ...rest] = documento.storagePath.split('/');
      const buffer = await this.storage.getObject(category, rest.join('/'));
      const texto = await this.openAiIa.extraerTextoPdf(buffer);

      if (!texto || texto.length < 50) {
        throw new Error('El PDF no contiene suficiente texto legible.');
      }

      const datosExtraidos = await this.openAiIa.extraerDatosCV(texto);
      this.aplicarVencimientoPorDefecto(datosExtraidos);

      await this.extraccionModel.findByIdAndUpdate(extraccion._id, {
        datosExtraidos,
        estado: 'propuesto',
      });

      this.logger.log(
        `Extracción completada para postulante ${extraccion.postulanteId.toString()}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.extraccionModel.findByIdAndUpdate(extraccion._id, {
        errorMensaje: msg,
        estado: 'rechazado',
      });
      this.logger.warn(`Extracción fallida: ${msg}`);
    }
  }

  private aplicarVencimientoPorDefecto(datos: DatosCV): void {
    if (!datos.cursos?.length) return;
    for (const curso of datos.cursos) {
      if (curso.fechaInicio && !curso.fechaVencimiento) {
        const inicio = new Date(curso.fechaInicio);
        if (!isNaN(inicio.getTime())) {
          const vencimiento = new Date(inicio);
          vencimiento.setFullYear(vencimiento.getFullYear() + 5);
          curso.fechaVencimiento = vencimiento.toISOString().slice(0, 10);
        }
      }
    }
  }

  async obtenerUltima(
    postulanteId: string,
  ): Promise<ExtraccionDocument | null> {
    if (!Types.ObjectId.isValid(postulanteId)) return null;
    return this.extraccionModel
      .findOne({ postulanteId: new Types.ObjectId(postulanteId) })
      .sort({ creadoEn: -1 });
  }

  async confirmar(
    id: string,
    datosConfirmados: DatosCV,
    actor: AuthUser,
  ): Promise<ExtraccionDocument> {
    const extraccion = await this.extraccionModel.findById(id);
    if (!extraccion) throw new NotFoundException('Extracción no encontrada');
    if (extraccion.estado !== 'propuesto') {
      throw new BadRequestException(
        'Solo se pueden confirmar extracciones en estado propuesto.',
      );
    }

    const updated = await this.extraccionModel.findByIdAndUpdate(
      id,
      {
        datosConfirmados,
        estado: 'confirmado',
        confirmadoPor: new Types.ObjectId(actor.userId),
        confirmadoEn: new Date(),
      },
      { new: true },
    );

    return updated!;
  }

  async rechazar(id: string): Promise<ExtraccionDocument> {
    const extraccion = await this.extraccionModel.findById(id);
    if (!extraccion) throw new NotFoundException('Extracción no encontrada');

    const updated = await this.extraccionModel.findByIdAndUpdate(
      id,
      { estado: 'rechazado' },
      { new: true },
    );

    return updated!;
  }
}
