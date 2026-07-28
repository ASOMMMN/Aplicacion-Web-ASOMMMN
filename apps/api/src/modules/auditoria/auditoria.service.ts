import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Auditoria, AuditoriaDocument } from './schemas/auditoria.schema';
import { escapeRegex } from '../../common/utils/regex.util';

interface RegistrarAuditoriaInput {
  actorId: string;
  actorEmail: string;
  accion: string;
  recurso: string;
  recursoId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectModel(Auditoria.name)
    private auditoriaModel: Model<AuditoriaDocument>,
  ) {}

  async listar(options: {
    actorEmail?: string;
    accion?: string;
    desde?: string;
    hasta?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: AuditoriaDocument[];
    total: number;
    page: number;
    pages: number;
  }> {
    const { actorEmail, accion, desde, hasta, page = 1, limit = 50 } = options;

    const filter: Record<string, unknown> = {};
    if (actorEmail)
      filter.actorEmail = { $regex: escapeRegex(actorEmail), $options: 'i' };
    if (accion) filter.accion = { $regex: escapeRegex(accion), $options: 'i' };
    if (desde || hasta) {
      const dateFilter: Record<string, Date> = {};
      if (desde) dateFilter.$gte = new Date(desde);
      if (hasta) dateFilter.$lte = new Date(hasta + 'T23:59:59.999Z');
      filter.creadoEn = dateFilter;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.auditoriaModel
        .find(filter)
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditoriaModel.countDocuments(filter),
    ]);

    return { data: data as AuditoriaDocument[], total, page, pages: Math.ceil(total / limit) };
  }

  async registrar(input: RegistrarAuditoriaInput): Promise<void> {
    try {
      await this.auditoriaModel.create({
        actorId: new Types.ObjectId(input.actorId),
        actorEmail: input.actorEmail,
        accion: input.accion,
        recurso: input.recurso,
        recursoId: input.recursoId,
        ipAddress: input.ipAddress,
        metadata: input.metadata,
        creadoEn: new Date(),
      });
    } catch (error: any) {
      this.logger.warn(`No se pudo registrar auditoria: ${error?.message}`);
    }
  }
}
