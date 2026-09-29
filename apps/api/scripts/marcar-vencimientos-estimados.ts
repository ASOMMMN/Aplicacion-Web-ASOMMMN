/**
 * Marca como estimados los vencimientos que el sistema calculaba como
 * fechaInicio + 5 años (regla eliminada). NO borra ni cambia fechas: solo
 * agrega fechaVencimientoEstimada = true para que el resumen muestre
 * el badge "Estimada" y una fecha real (subida o del CV) tenga prioridad.
 *
 * Colecciones:
 *   - cursos: campo fechaVencimientoEstimada del documento.
 *   - extracciones_ia: cursos[i].fechaVencimientoEstimada dentro de
 *     datosExtraidos y datosConfirmados (la extracción del CV también
 *     aplicaba la regla).
 *
 * Limitación: si un postulante capturó a mano un vencimiento que es
 * exactamente inicio + 5 años (vigencia real de 5 años), también se marca;
 * no hay forma de distinguirlo. Solo afecta al badge, no a la fecha.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/marcar-vencimientos-estimados.ts --uri "<mongodb-uri>"
 *   npx ts-node apps/api/scripts/marcar-vencimientos-estimados.ts --uri "<mongodb-uri>" --ejecutar
 *
 * Por defecto es --dry-run (solo cuenta y muestra ejemplos).
 */
import type { AnyBulkWriteOperation, Document } from 'mongodb';
import { esVencimientoInicioMasCincoAnios } from '../src/modules/cursos/vencimiento-estimado.util';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/marcar-vencimientos-estimados.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

interface CursoCV {
  nombre?: string;
  fechaInicio?: string | null;
  fechaVencimiento?: string | null;
  fechaVencimientoEstimada?: boolean;
}

/** Devuelve el arreglo con las marcas aplicadas, o null si no cambió nada. */
function marcarCursosCV(cursos: unknown): {
  cursos: CursoCV[];
  marcados: number;
} | null {
  if (!Array.isArray(cursos)) return null;
  let marcados = 0;
  const nuevos = (cursos as CursoCV[]).map((c) => {
    if (
      !c?.fechaVencimientoEstimada &&
      esVencimientoInicioMasCincoAnios(c?.fechaInicio, c?.fechaVencimiento)
    ) {
      marcados++;
      return { ...c, fechaVencimientoEstimada: true };
    }
    return c;
  });
  return marcados > 0 ? { cursos: nuevos, marcados } : null;
}

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  console.log(
    `Modo: ${ejecutar ? 'EJECUTAR (escribe)' : 'DRY-RUN (no escribe)'}\n`,
  );

  // ── cursos ────────────────────────────────────────────────────────────────
  const cursosCol = db.collection('cursos');
  const candidatos = await cursosCol
    .find(
      {
        fechaInicio: { $type: 'date' },
        fechaVencimiento: { $type: 'date' },
        fechaVencimientoEstimada: { $ne: true },
      },
      { projection: { nombreCurso: 1, fechaInicio: 1, fechaVencimiento: 1 } },
    )
    .toArray();

  const cursosAMarcar = candidatos.filter((c) =>
    esVencimientoInicioMasCincoAnios(
      c.fechaInicio as Date,
      c.fechaVencimiento as Date,
    ),
  );
  console.log(
    `cursos: ${cursosAMarcar.length} de ${candidatos.length} con inicio y vencimiento tienen vencimiento = inicio + 5 años.`,
  );
  for (const c of cursosAMarcar.slice(0, 10)) {
    console.log(
      `  - ${String(c.nombreCurso)} · ${(c.fechaInicio as Date).toISOString().slice(0, 10)} → ${(c.fechaVencimiento as Date).toISOString().slice(0, 10)}`,
    );
  }
  if (cursosAMarcar.length > 10)
    console.log(`  … y ${cursosAMarcar.length - 10} más`);

  // ── extracciones_ia ───────────────────────────────────────────────────────
  const extCol = db.collection('extracciones_ia');
  const extracciones = await extCol
    .find(
      {
        $or: [
          { 'datosExtraidos.cursos.0': { $exists: true } },
          { 'datosConfirmados.cursos.0': { $exists: true } },
        ],
      },
      {
        projection: {
          'datosExtraidos.cursos': 1,
          'datosConfirmados.cursos': 1,
        },
      },
    )
    .toArray();

  const opsExt: AnyBulkWriteOperation<Document>[] = [];
  let cursosCVMarcados = 0;
  for (const e of extracciones) {
    const set: Record<string, CursoCV[]> = {};
    const ext = marcarCursosCV(
      (e.datosExtraidos as { cursos?: unknown } | undefined)?.cursos,
    );
    const conf = marcarCursosCV(
      (e.datosConfirmados as { cursos?: unknown } | undefined)?.cursos,
    );
    if (ext) {
      set['datosExtraidos.cursos'] = ext.cursos;
      cursosCVMarcados += ext.marcados;
    }
    if (conf) {
      set['datosConfirmados.cursos'] = conf.cursos;
      cursosCVMarcados += conf.marcados;
    }
    if (ext || conf) {
      opsExt.push({
        updateOne: { filter: { _id: e._id }, update: { $set: set } },
      });
    }
  }
  console.log(
    `extracciones_ia: ${cursosCVMarcados} curso(s) del CV a marcar en ${opsExt.length} de ${extracciones.length} extracción(es).`,
  );

  if (!ejecutar) {
    console.log('\nDRY-RUN: no se escribió nada. Usa --ejecutar para aplicar.');
    await desconectar();
    return;
  }
  if (cursosAMarcar.length === 0 && opsExt.length === 0) {
    console.log('\nNada que marcar.');
    await desconectar();
    return;
  }

  await confirmarEscritura(nombreBase);

  if (cursosAMarcar.length > 0) {
    const r = await cursosCol.updateMany(
      { _id: { $in: cursosAMarcar.map((c) => c._id) } },
      { $set: { fechaVencimientoEstimada: true } },
    );
    console.log(`cursos: ${r.modifiedCount} marcado(s).`);
  }
  if (opsExt.length > 0) {
    const r = await extCol.bulkWrite(opsExt);
    console.log(`extracciones_ia: ${r.modifiedCount} actualizada(s).`);
  }

  await desconectar();
  console.log('Listo.');
}

main().catch(async (err) => {
  console.error('El script falló:', err);
  await desconectar().catch(() => undefined);
  process.exit(1);
});
