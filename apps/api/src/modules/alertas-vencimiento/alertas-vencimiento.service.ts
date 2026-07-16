import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';

import { Curso, CursoDocument } from '../cursos/schemas/curso.schema';
import { Postulante, PostulanteDocument } from '../postulantes/schemas/postulante.schema';
import { Notificacion, NotificacionDocument } from './schemas/notificacion.schema';
import { NotificacionItemDto } from './dto/notificacion-response.dto';

const UMBRALES_DIAS = [90, 30, 7] as const;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

@Injectable()
export class AlertasVencimientoService {
  private readonly logger = new Logger(AlertasVencimientoService.name);

  constructor(
    @InjectModel(Curso.name) private readonly cursoModel: Model<CursoDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Notificacion.name)
    private readonly notificacionModel: Model<NotificacionDocument>,
  ) {}

  @Cron('0 6 * * *', { name: 'revisar-vencimientos-cursos', timeZone: 'America/Mexico_City' })
  async revisarVencimientosCron(): Promise<void> {
    const { creadas } = await this.revisarVencimientos();
    this.logger.log(
      `Revisión diaria de vencimientos completada: ${creadas} notificación(es) nueva(s).`,
    );
  }

  // El índice único {cursoId, diasAnticipacion} evita duplicados si el job corre más de una vez.
  async revisarVencimientos(): Promise<{ creadas: number }> {
    const ahora = new Date();

    const cursos = await this.cursoModel
      .find({ fechaVencimiento: { $ne: null, $exists: true } })
      .populate({
        path: 'postulanteId',
        populate: { path: 'usuarioId', select: 'nombre apellidos' },
      })
      .lean();

    let creadas = 0;

    for (const curso of cursos) {
      if (!curso.fechaVencimiento) continue;

      const diasRestantes = Math.ceil(
        (new Date(curso.fechaVencimiento).getTime() - ahora.getTime()) / MS_POR_DIA,
      );
      if (diasRestantes < 0) continue;

      const postulante = curso.postulanteId as unknown as
        | (Postulante & { _id: Types.ObjectId; usuarioId?: { nombre?: string; apellidos?: string } })
        | null;
      if (!postulante) continue;

      const usuario = postulante.usuarioId as { nombre?: string; apellidos?: string } | undefined;
      const nombreCandidato = usuario
        ? `${usuario.nombre ?? ''} ${usuario.apellidos ?? ''}`.trim()
        : 'Candidato';

      for (const umbral of UMBRALES_DIAS) {
        if (diasRestantes > umbral) continue;

        const resultado = await this.notificacionModel.updateOne(
          { cursoId: curso._id, diasAnticipacion: umbral },
          {
            $setOnInsert: {
              tipo: 'curso_por_vencer',
              candidatoId: postulante._id,
              cursoId: curso._id,
              nombreCandidato,
              nombreCurso: curso.nombreCurso,
              fechaVencimiento: curso.fechaVencimiento,
              diasAnticipacion: umbral,
              leida: false,
              fechaCreacion: new Date(),
              evaluadorId: null,
            },
          },
          { upsert: true },
        );

        if (resultado.upsertedCount > 0) creadas += 1;
      }
    }

    return { creadas };
  }

  async listar(soloNoLeidas: boolean): Promise<NotificacionItemDto[]> {
    const filtro = soloNoLeidas ? { leida: false } : {};
    const notificaciones = await this.notificacionModel
      .find(filtro)
      .sort({ fechaCreacion: -1 })
      .lean();

    const ahora = new Date();
    return notificaciones.map((n) => ({
      _id: String(n._id),
      tipo: n.tipo,
      candidatoId: String(n.candidatoId),
      cursoId: String(n.cursoId),
      nombreCandidato: n.nombreCandidato,
      nombreCurso: n.nombreCurso,
      fechaVencimiento: n.fechaVencimiento,
      diasAnticipacion: n.diasAnticipacion,
      diasRestantes: Math.ceil(
        (new Date(n.fechaVencimiento).getTime() - ahora.getTime()) / MS_POR_DIA,
      ),
      leida: n.leida,
      fechaCreacion: n.fechaCreacion,
    }));
  }

  async contarNoLeidas(): Promise<{ count: number }> {
    const count = await this.notificacionModel.countDocuments({ leida: false });
    return { count };
  }

  async marcarLeida(id: string): Promise<{ message: string }> {
    const resultado = await this.notificacionModel.updateOne(
      { _id: id },
      { $set: { leida: true } },
    );
    if (resultado.matchedCount === 0) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    return { message: 'Notificación marcada como leída.' };
  }

  async marcarTodasLeidas(): Promise<{ message: string }> {
    await this.notificacionModel.updateMany({ leida: false }, { $set: { leida: true } });
    return { message: 'Todas las notificaciones fueron marcadas como leídas.' };
  }
}
