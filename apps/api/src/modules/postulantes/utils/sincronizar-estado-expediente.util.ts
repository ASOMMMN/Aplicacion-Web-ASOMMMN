import { Model, Types } from 'mongoose';

import { PostulanteDocument } from '../schemas/postulante.schema';
import { DocumentoDocument } from '../../documentos/schemas/documento.schema';
import { DocPersonalDocument } from '../../docs-personales/schemas/doc-personal.schema';
import {
  REQUISITOS_EXPEDIENTE,
  resolverEstadoExpediente,
} from '../constants/expediente.constants';

export interface ModelosExpediente {
  postulanteModel: Model<PostulanteDocument>;
  documentoModel: Model<DocumentoDocument>;
  docPersonalModel: Model<DocPersonalDocument>;
}

/**
 * Único lugar que decide y persiste la democión 'enviado' → 'en_proceso'
 * cuando el % de avance ya no es 100%. Para llamadores que YA calcularon
 * `porcentaje`/`estadoGuardado` (evitar refetch — ver postulantes.service.ts
 * #calcularProgreso y evaluaciones.service.ts#obtenerCandidato).
 */
export async function demoverSiExpedienteIncompleto(
  postulanteModel: Model<PostulanteDocument>,
  postulanteId: Types.ObjectId | string,
  porcentaje: number,
  estadoGuardado: 'en_proceso' | 'enviado',
): Promise<'en_proceso' | 'enviado'> {
  const estadoExpediente = resolverEstadoExpediente(porcentaje, estadoGuardado);
  if (estadoExpediente !== estadoGuardado) {
    await postulanteModel.updateOne(
      { _id: postulanteId },
      { $set: { estadoExpediente: 'en_proceso' }, $unset: { enviadoEn: '' } },
    );
  }
  return estadoExpediente;
}

/**
 * Recalcula el % de avance de UN postulante desde cero y, si su expediente
 * está marcado 'enviado' pero ya no cumple el 100% (por ejemplo, se borró un
 * documento requerido o se vació la vacante después de haberlo enviado), lo
 * demociona a 'en_proceso' y limpia `enviadoEn`. No-op si el postulante no
 * existe o su expediente no está 'enviado' (nada que corregir).
 *
 * Para llamadores que NO tienen `porcentaje` a la mano — ver
 * docs-personales.service.ts#eliminar y documentos.service.ts#eliminarCV,
 * los puntos de escritura que pueden invalidar un expediente ya enviado.
 * Reemplaza la auto-corrección que antes vivía en cada lectura de
 * evaluaciones.service.ts (construirCandidatos/obtenerCandidato): el dato
 * queda consistente al escribir, sin side-effects de escritura en GETs.
 */
export async function sincronizarEstadoExpediente(
  modelos: ModelosExpediente,
  postulanteId: Types.ObjectId | string,
): Promise<void> {
  const postulante = await modelos.postulanteModel
    .findById(postulanteId)
    .select('estadoExpediente vacante')
    .lean();
  if (!postulante || postulante.estadoExpediente !== 'enviado') return;

  const [tieneCV, tiposDP] = await Promise.all([
    modelos.documentoModel.exists({ postulanteId, esActual: true }),
    modelos.docPersonalModel.distinct('tipo', { postulanteId }),
  ]);

  const cumplidos = new Set<string>(tiposDP as string[]);
  if (tieneCV) cumplidos.add('cv');
  if (postulante.vacante?.trim()) cumplidos.add('vacante');

  const requeridos = REQUISITOS_EXPEDIENTE.filter((r) => r.requerido);
  const cumplidosCount = requeridos.filter((r) =>
    cumplidos.has(r.clave),
  ).length;
  const porcentaje = Math.round((cumplidosCount / requeridos.length) * 100);

  await demoverSiExpedienteIncompleto(
    modelos.postulanteModel,
    postulanteId,
    porcentaje,
    'enviado',
  );
}
