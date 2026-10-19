/**
 * Reconstruye, para candidatos cuyo Usuario fue borrado con HARD DELETE antes
 * de que existiera soft-delete (ver src/modules/usuarios/schemas/usuario.schema.ts),
 * el snapshot/origen de esa eliminación cruzando con la colección `auditoria`
 * (acción 'usuarios.eliminar', recurso 'usuario', recursoId = usuarioId viejo).
 *
 * Antes de este script esas filas se mostraban en el panel como "Usuario
 * eliminado" con solo un ID. El resultado se escribe en el propio
 * `postulantes.legacyEliminacion` (el Usuario original ya no existe y no se
 * puede recuperar — ver postulante.schema.ts#LegacyEliminacionUsuario).
 *
 * Si NO hay rastro en auditoria, se marca igual como detectado pero con
 * origen 'desconocido' y sin snapshot (no se inventan datos).
 *
 * También hace un backfill necesario: `usuarios` que no tengan el campo
 * `isDeleted` (todos los creados antes de este cambio) no quedan cubiertos
 * por el índice único parcial `{email:1}` con
 * `partialFilterExpression:{isDeleted:false}` — Mongo solo indexa documentos
 * que YA tienen isDeleted=false, no los que simplemente no tienen el campo.
 * Sin este backfill, dos cuentas activas podrían terminar con el mismo email
 * sin que el índice lo detecte. Se pone `isDeleted:false` a todo usuario sin
 * el campo.
 *
 * Idempotente: se salta cualquier postulante que ya tenga
 * `legacyEliminacion.detectado`, y cualquier usuario que ya tenga `isDeleted`.
 * Volver a correrlo no duplica trabajo.
 *
 * Por defecto es --dry-run (solo reporta). Con --ejecutar pide escribir el
 * nombre de la base para confirmar.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/reconstruir-eliminaciones-legacy.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]
 */
import type { Document, ObjectId, WithId } from 'mongodb';

import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/reconstruir-eliminaciones-legacy.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

type Plan = {
  postulanteId: ObjectId;
  usuarioIdViejo: ObjectId;
  origen: 'admin' | 'desconocido';
  email?: string;
  nombre?: string;
  apellidos?: string;
  deletedAt?: Date;
  deletedByEmail?: string;
  deletedByNombre?: string;
  motivo?: string;
};

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    const usuariosSinCampo = await db
      .collection('usuarios')
      .countDocuments({ isDeleted: { $exists: false } });
    console.log(
      `\nUsuarios sin campo isDeleted (a poner en false): ${usuariosSinCampo}`,
    );

    const postulantes: WithId<Document>[] = await db
      .collection('postulantes')
      .find({ 'legacyEliminacion.detectado': { $ne: true } })
      .toArray();

    const plan: Plan[] = [];

    for (const postulante of postulantes) {
      const usuarioIdViejo = postulante.usuarioId as ObjectId | undefined;
      if (!usuarioIdViejo) continue;

      const usuarioVivo = await db
        .collection('usuarios')
        .findOne({ _id: usuarioIdViejo }, { projection: { _id: 1 } });
      // Si el Usuario sigue existiendo (soft-delete o activo), no es un caso
      // legado: ya lo resuelve populate() en tiempo real.
      if (usuarioVivo) continue;

      const evento = await db
        .collection('auditoria')
        .find({
          recurso: 'usuario',
          recursoId: usuarioIdViejo.toString(),
          accion: 'usuarios.eliminar',
        })
        .sort({ creadoEn: -1 })
        .limit(1)
        .next();

      if (!evento) {
        plan.push({
          postulanteId: postulante._id as ObjectId,
          usuarioIdViejo,
          origen: 'desconocido',
        });
        continue;
      }

      const metadata = (evento.metadata ?? {}) as Record<string, unknown>;
      let deletedByNombre: string | undefined;
      const actorId = evento.actorId as ObjectId | undefined;
      if (actorId) {
        const actor = await db
          .collection('usuarios')
          .findOne(
            { _id: actorId },
            { projection: { nombre: 1, apellidos: 1 } },
          );
        if (actor) {
          deletedByNombre = `${actor.nombre ?? ''} ${actor.apellidos ?? ''}`.trim();
        }
      }

      plan.push({
        postulanteId: postulante._id as ObjectId,
        usuarioIdViejo,
        origen: 'admin', // la autoeliminación no existía cuando esto pasó
        email: typeof metadata.objetivoEmail === 'string' ? metadata.objetivoEmail : undefined,
        deletedAt: evento.creadoEn as Date | undefined,
        deletedByEmail: evento.actorEmail as string | undefined,
        deletedByNombre,
        motivo: typeof metadata.motivo === 'string' ? metadata.motivo : undefined,
      });
    }

    console.log(`\nCandidatos huérfanos a reconstruir: ${plan.length}`);
    for (const c of plan) {
      console.log(
        `  [postulantes:${c.postulanteId.toString()}] usuario viejo ${c.usuarioIdViejo.toString()} → origen=${c.origen}` +
          (c.email ? ` email=${c.email}` : '') +
          (c.deletedByEmail ? ` eliminadoPor=${c.deletedByEmail}` : ''),
      );
    }

    if (!ejecutar) {
      console.log('\nDRY-RUN: no se escribió nada.');
      return;
    }
    if (plan.length === 0 && usuariosSinCampo === 0) {
      console.log('\nNada que escribir.');
      return;
    }
    await confirmarEscritura(nombreBase);

    if (usuariosSinCampo > 0) {
      const rBackfill = await db
        .collection('usuarios')
        .updateMany(
          { isDeleted: { $exists: false } },
          { $set: { isDeleted: false } },
        );
      console.log(
        `\nBackfill usuarios.isDeleted: ${rBackfill.modifiedCount} actualizado(s).`,
      );
    }

    let escritos = 0;
    const reconstruidoEn = new Date();
    for (const c of plan) {
      const r = await db.collection('postulantes').updateOne(
        { _id: c.postulanteId },
        {
          $set: {
            legacyEliminacion: {
              detectado: true,
              origen: c.origen,
              email: c.email,
              nombre: c.nombre,
              apellidos: c.apellidos,
              deletedAt: c.deletedAt,
              deletedByEmail: c.deletedByEmail,
              deletedByNombre: c.deletedByNombre,
              motivo: c.motivo,
              reconstruidoEn,
            },
          },
        },
      );
      escritos += r.modifiedCount;
    }
    console.log(`\nActualizados: ${escritos}.`);
  } finally {
    await desconectar();
  }
}

main().catch(async (err) => {
  console.error('El script falló:', (err as Error).message);
  await desconectar();
  process.exit(1);
});
