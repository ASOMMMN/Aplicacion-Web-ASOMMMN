/**
 * Repara, en los postulantes YA GUARDADOS, los expedientes marcados
 * `estadoExpediente='enviado'` que ya no sostienen el 100% de avance (por
 * ejemplo, se borró un documento requerido o se vació la vacante después de
 * haberlo enviado).
 *
 * Hasta esta fase esa corrección se aplicaba silenciosamente en CADA lectura
 * de GET /evaluaciones/candidatos (ver evaluaciones.service.ts). Ahora la
 * corrección ocurre solo en los puntos de escritura que pueden invalidar un
 * expediente ya enviado (ver
 * src/modules/postulantes/utils/sincronizar-estado-expediente.util.ts); este
 * script repara, una sola vez, el historial que haya quedado inconsistente
 * antes de ese cambio (o por cualquier escritura directa a la base).
 *
 * Por defecto es --dry-run (solo reporta). Con --ejecutar pide escribir el
 * nombre de la base para confirmar, igual que el resto de scripts de
 * /scripts, y antes de tocar la base guarda un respaldo JSON (estadoExpediente
 * y enviadoEn originales) en apps/api/reportes-ia/ (fuera de git) para poder
 * revertir a mano si algo salió mal.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/reparar-estado-expediente-inconsistente.ts --uri "<mongodb-uri>" [--ejecutar]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ObjectId } from 'mongodb';

import { REQUISITOS_EXPEDIENTE } from '../src/modules/postulantes/constants/expediente.constants';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/reparar-estado-expediente-inconsistente.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

const REQUISITOS_OBLIGATORIOS = REQUISITOS_EXPEDIENTE.filter(
  (r) => r.requerido,
);

interface Plan {
  _id: ObjectId;
  porcentaje: number;
  enviadoEnOriginal: unknown;
}

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    const postulantes = await db
      .collection('postulantes')
      .find({ estadoExpediente: 'enviado' })
      .toArray();

    const planCorregir: Plan[] = [];

    for (const p of postulantes) {
      const [tieneCV, tiposDP] = await Promise.all([
        db
          .collection('documentos')
          .findOne({ postulanteId: p._id, esActual: true }),
        db
          .collection('docs_personales')
          .distinct('tipo', { postulanteId: p._id }),
      ]);

      const cumplidos = new Set<string>(tiposDP as string[]);
      if (tieneCV) cumplidos.add('cv');
      if (typeof p.vacante === 'string' && p.vacante.trim()) {
        cumplidos.add('vacante');
      }

      const cumplidosCount = REQUISITOS_OBLIGATORIOS.filter((r) =>
        cumplidos.has(r.clave),
      ).length;
      const porcentaje = Math.round(
        (cumplidosCount / REQUISITOS_OBLIGATORIOS.length) * 100,
      );

      if (porcentaje < 100) {
        planCorregir.push({
          _id: p._id,
          porcentaje,
          enviadoEnOriginal: p.enviadoEn ?? null,
        });
      }
    }

    console.log(
      `\nPostulantes a corregir (enviado → en_proceso): ${planCorregir.length}`,
    );
    for (const p of planCorregir) {
      console.log(
        `  [postulantes:${p._id.toString()}] avance actual: ${p.porcentaje}%`,
      );
    }

    if (!ejecutar) {
      console.log('\nDRY-RUN: no se escribió nada.');
      return;
    }
    if (planCorregir.length === 0) {
      console.log('\nNada que escribir.');
      return;
    }
    await confirmarEscritura(nombreBase);

    // Respaldo del valor original ANTES de escribir, para poder revertir a
    // mano si algún registro se corrige mal.
    mkdirSync(resolve(__dirname, '../reportes-ia'), { recursive: true });
    const rutaRespaldo = resolve(
      __dirname,
      `../reportes-ia/respaldo-estado-expediente-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      rutaRespaldo,
      JSON.stringify(
        planCorregir.map((p) => ({
          _id: p._id.toString(),
          estadoExpedienteOriginal: 'enviado',
          enviadoEnOriginal: p.enviadoEnOriginal,
          porcentajeDetectado: p.porcentaje,
        })),
        null,
        2,
      ),
    );
    console.log(`\nRespaldo escrito en: ${rutaRespaldo}`);

    let escritos = 0;
    for (const p of planCorregir) {
      const r = await db
        .collection('postulantes')
        .updateOne(
          { _id: p._id },
          { $set: { estadoExpediente: 'en_proceso' }, $unset: { enviadoEn: '' } },
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
