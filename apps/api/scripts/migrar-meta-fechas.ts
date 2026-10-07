/**
 * Guarda metaFechas en los documentos personales y cursos que aún no lo
 * tienen (registros anteriores al 2026-10-06). Es retrocompatible: no cambia
 * ninguna fecha, solo agrega sus metadatos deducidos con la misma lógica
 * que se usa al leer (src/modules/docs-personales/ia/meta-fechas-derivadas.ts):
 * - fechas verificadas por el evaluador → fuente manual, bloqueadas;
 * - documentos personales → fuente ia, con la precisión guardada o la
 *   inferida del texto literal y la confianza/evidencia del análisis;
 * - cursos → regla (vencimiento estimado), ia (con documento) o manual.
 *
 * Por defecto es --dry-run. Con --ejecutar pide el nombre de la base y solo
 * escribe en registros que siguen sin metaFechas.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/migrar-meta-fechas.ts --uri "<mongodb-uri>" [--ejecutar]
 */
import type { Document, WithId } from 'mongodb';

import {
  FechasVerificadasLegado,
  metaFechasCurso,
  metaFechasDocPersonal,
} from '../src/modules/docs-personales/ia/meta-fechas-derivadas';
import type { MetaFechas } from '../src/modules/docs-personales/ia/meta-fechas';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/migrar-meta-fechas.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

function resumen(meta: MetaFechas, cuenta: Map<string, number>) {
  for (const m of Object.values(meta)) {
    const k = `${m.fuente}${m.bloqueada ? ' (bloqueada)' : ''} · precisión ${m.precision}`;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
}

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    const sinMeta = { metaFechas: { $exists: false } };
    const docs = await db.collection('docs_personales').find(sinMeta).toArray();
    const cursos = await db.collection('cursos').find(sinMeta).toArray();

    const planDocs = docs.map((d: WithId<Document>) => ({
      _id: d._id,
      meta: metaFechasDocPersonal({
        ...(d as Parameters<typeof metaFechasDocPersonal>[0]),
        fechasVerificadas:
          d.fechasVerificadas as FechasVerificadasLegado | null,
      }),
    }));
    const planCursos = cursos.map((c: WithId<Document>) => ({
      _id: c._id,
      meta: metaFechasCurso(c as Parameters<typeof metaFechasCurso>[0]),
    }));

    const cuentaDocs = new Map<string, number>();
    const cuentaCursos = new Map<string, number>();
    planDocs.forEach((p) => resumen(p.meta, cuentaDocs));
    planCursos.forEach((p) => resumen(p.meta, cuentaCursos));
    console.log(`\nDocumentos personales sin metaFechas: ${docs.length}`);
    for (const [k, n] of cuentaDocs) console.log(`  ${k}: ${n} fecha(s)`);
    console.log(`Cursos sin metaFechas: ${cursos.length}`);
    for (const [k, n] of cuentaCursos) console.log(`  ${k}: ${n} fecha(s)`);

    if (!ejecutar) {
      console.log(
        '\nDRY-RUN: no se escribió nada. Ninguna fecha cambia al ejecutar.',
      );
      return;
    }
    await confirmarEscritura(nombreBase);
    let escritos = 0;
    for (const [col, plan] of [
      ['docs_personales', planDocs],
      ['cursos', planCursos],
    ] as const) {
      for (const p of plan) {
        const r = await db
          .collection(col)
          .updateOne(
            { _id: p._id, metaFechas: { $exists: false } },
            { $set: { metaFechas: p.meta } },
          );
        escritos += r.modifiedCount;
      }
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
