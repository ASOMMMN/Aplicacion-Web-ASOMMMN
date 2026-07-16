import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import {
  Documento,
  DocumentoDocument,
} from '../documentos/schemas/documento.schema';
import {
  Evaluacion,
  EvaluacionDocument,
} from '../evaluaciones/schemas/evaluacion.schema';
import {
  EstadisticasResponseDto,
  EvaluadorStatsDto,
} from './dto/estadisticas-response.dto';

@Injectable()
export class ReportesService {
  constructor(
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
    @InjectModel(Postulante.name)
    private postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Documento.name)
    private documentoModel: Model<DocumentoDocument>,
    @InjectModel(Evaluacion.name)
    private evaluacionModel: Model<EvaluacionDocument>,
  ) {}

  async getEstadisticas(): Promise<EstadisticasResponseDto> {
    const treintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsuarios,
      usuariosPorRol,
      usuariosActivos,
      totalPostulantes,
      postulantesEstado,
      totalDocumentos,
      docsUltimoMes,
      totalEvaluaciones,
      promedioResult,
      postulanteIdsConCV,
      evalPorEvaluador,
    ] = await Promise.all([
      this.usuarioModel.countDocuments(),
      this.usuarioModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$rol', count: { $sum: 1 } } },
      ]),
      this.usuarioModel.countDocuments({ estadoCuenta: 'activa' }),
      this.postulanteModel.countDocuments(),
      this.postulanteModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$estadoPostulacion', count: { $sum: 1 } } },
      ]),
      this.documentoModel.countDocuments({ esActual: true }),
      this.documentoModel.countDocuments({
        esActual: true,
        subidasEn: { $gte: treintaDiasAtras },
      }),
      this.evaluacionModel.countDocuments(),
      this.evaluacionModel.aggregate<{ avg: number }>([
        { $match: { calificacion: { $exists: true, $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$calificacion' } } },
      ]),
      this.documentoModel.distinct('postulanteId', { esActual: true }),
      this.evaluacionModel.aggregate<{
        _id: unknown;
        nombre: string;
        total: number;
        avg: number;
      }>([
        {
          $lookup: {
            from: 'usuarios',
            localField: 'evaluadorId',
            foreignField: '_id',
            as: 'evaluador',
          },
        },
        { $unwind: '$evaluador' },
        {
          $group: {
            _id: '$evaluadorId',
            nombre: {
              $first: {
                $concat: ['$evaluador.nombre', ' ', '$evaluador.apellidos'],
              },
            },
            total: { $sum: 1 },
            avg: { $avg: '$calificacion' },
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    const rolMap = new Map<string, number>(
      usuariosPorRol.map((r) => [r._id, r.count]),
    );
    const estadoMap = new Map<string, number>(
      postulantesEstado.map((e) => [e._id, e.count]),
    );

    const conCV = postulanteIdsConCV.length;
    const sinCV = Math.max(0, totalPostulantes - conCV);

    const porEvaluador: EvaluadorStatsDto[] = evalPorEvaluador.map((item) => ({
      evaluadorId: String(item._id),
      nombre: item.nombre ?? '',
      total: item.total,
      promedio: item.avg != null ? parseFloat(item.avg.toFixed(1)) : null,
    }));

    return {
      usuarios: {
        total: totalUsuarios,
        postulantes: rolMap.get('postulante') ?? 0,
        evaluadores: rolMap.get('evaluador') ?? 0,
        administradores: rolMap.get('administrador') ?? 0,
        activos: usuariosActivos,
      },
      postulantes: {
        total: totalPostulantes,
        enProceso: estadoMap.get('en_proceso') ?? 0,
        completados: estadoMap.get('completado') ?? 0,
        rechazados: estadoMap.get('rechazado') ?? 0,
        conCV,
        sinCV,
      },
      evaluaciones: {
        total: totalEvaluaciones,
        promedioCalificacion:
          promedioResult[0]?.avg != null
            ? parseFloat(promedioResult[0].avg.toFixed(1))
            : null,
        porEvaluador,
      },
      documentos: {
        total: totalDocumentos,
        ultimoMes: docsUltimoMes,
      },
    };
  }

  async exportarCandidatosCSV(): Promise<string> {
    const postulantes = await this.postulanteModel
      .find()
      .populate('usuarioId', 'nombre apellidos email')
      .lean();

    const postulanteIds = postulantes.map((p) => p._id);

    const [docsActuales, evaluaciones] = await Promise.all([
      this.documentoModel
        .find({ postulanteId: { $in: postulanteIds }, esActual: true })
        .select('postulanteId version subidasEn')
        .lean(),
      this.evaluacionModel
        .find({ postulanteId: { $in: postulanteIds } })
        .select('postulanteId calificacion')
        .lean(),
    ]);

    const cvMap = new Map<string, number>(
      docsActuales.map((d) => [String(d.postulanteId), d.version]),
    );
    const evalCountMap = new Map<string, number>();
    for (const ev of evaluaciones) {
      const k = String(ev.postulanteId);
      evalCountMap.set(k, (evalCountMap.get(k) ?? 0) + 1);
    }

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const headers = [
      'ID',
      'Nombre',
      'Apellidos',
      'Email',
      'Estado postulación',
      'Ciudad',
      'País',
      'Tiene CV',
      'Versión CV',
      'Evaluaciones recibidas',
    ].join(',');

    const rows = postulantes.map((p: any) => {
      const user = p.usuarioId;
      const cv = cvMap.get(String(p._id));
      return [
        String(p._id),
        user?.nombre ?? '',
        user?.apellidos ?? '',
        user?.email ?? '',
        p.estadoPostulacion,
        p.ciudad ?? '',
        p.pais ?? '',
        cv != null ? 'Sí' : 'No',
        cv != null ? String(cv) : '',
        String(evalCountMap.get(String(p._id)) ?? 0),
      ]
        .map(escapeCsv)
        .join(',');
    });

    return [headers, ...rows].join('\n');
  }
}
