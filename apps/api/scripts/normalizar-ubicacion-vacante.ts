/**
 * Normaliza, en los registros YA GUARDADOS de `postulantes`, la
 * capitalización y los acentos de `ciudad`, `pais` y `vacante` con la misma
 * función `capitalizarTitulo` que ya se aplica a las escrituras nuevas (ver
 * src/modules/postulantes/postulantes.service.ts#actualizarPerfil). Es
 * idempotente: volver a correrlo sobre datos ya normalizados no produce
 * cambios (plan vacío).
 *
 * Por defecto es --dry-run (solo reporta). Con --ejecutar pide escribir el
 * nombre de la base para confirmar.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/normalizar-ubicacion-vacante.ts --uri "<mongodb-uri>" [--ejecutar]
 */
import type { Document, ObjectId, WithId } from 'mongodb';

import { capitalizarTitulo } from '../src/common/utils/normalizar-texto.util';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/normalizar-ubicacion-vacante.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

const CAMPOS = ['ciudad', 'pais', 'vacante'] as const;

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    type Cambio = {
      _id: ObjectId;
      campo: (typeof CAMPOS)[number];
      original: string;
      normalizado: string;
    };
    const plan: Cambio[] = [];

    const filtro = {
      $or: CAMPOS.map((campo) => ({ [campo]: { $type: 'string' } })),
    };
    const docs: WithId<Document>[] = await db
      .collection('postulantes')
      .find(filtro)
      .toArray();

    for (const doc of docs) {
      for (const campo of CAMPOS) {
        const original: unknown = doc[campo];
        if (typeof original !== 'string' || original.trim() === '') continue;

        const normalizado = capitalizarTitulo(original);
        if (normalizado !== original) {
          plan.push({ _id: doc._id, campo, original, normalizado });
        }
      }
    }

    console.log(`\nValores a normalizar: ${plan.length}`);
    for (const c of plan) {
      console.log(
        `  [postulantes:${c._id.toString()}] ${c.campo}: "${c.original}" → "${c.normalizado}"`,
      );
    }

    if (!ejecutar) {
      console.log('\nDRY-RUN: no se escribió nada.');
      return;
    }
    if (plan.length === 0) {
      console.log('\nNada que escribir.');
      return;
    }
    await confirmarEscritura(nombreBase);

    let escritos = 0;
    for (const c of plan) {
      const r = await db
        .collection('postulantes')
        .updateOne({ _id: c._id }, { $set: { [c.campo]: c.normalizado } });
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
