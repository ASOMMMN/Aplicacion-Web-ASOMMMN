/**
 * Aplica la regla de vencimiento de cursos (regla-vencimiento-curso.ts) a
 * los cursos registrados antes del 2026-10-05 (sin origenVencimiento).
 *
 * Qué hace con cada curso:
 * - Vencimiento explícito (no estimado): NO se toca.
 * - Vencimiento estimado (fechaVencimientoEstimada): solo se guarda
 *   origenVencimiento = CALCULADO_5_ANOS; la fecha no cambia.
 * - Sin vencimiento y CON documento: base = fechaInicio (o fechaEmision);
 *   vencimiento = base + 5 años (CALCULADO_5_ANOS, estimado). Sin base →
 *   REQUIERE_REVISION (sin fecha). fechaCurso NO se usa como base: en
 *   registros viejos puede ser el día de la subida.
 * - Sin vencimiento y SIN documento: no aplica la regla; no se toca.
 *
 * Por defecto es --dry-run: imprime lo que cambiaría y deja un CSV en
 * apps/api/reportes-ia/ (fuera de git). Con --ejecutar pide confirmar el
 * nombre de la base y escribe solo si el curso sigue igual que al leerlo.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/migrar-vencimientos-cursos.ts --uri "<mongodb-uri>"
 *   npx ts-node apps/api/scripts/migrar-vencimientos-cursos.ts --uri "<mongodb-uri>" --ejecutar
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Accion,
  CursoGuardado,
  planificar,
} from '../src/modules/cursos/migracion-vencimientos.util';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/migrar-vencimientos-cursos.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

const csv = (v: string | null | undefined) =>
  `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    const col = db.collection('cursos');
    const cursos = (await col
      .find({ origenVencimiento: { $exists: false } })
      .toArray()) as CursoGuardado[];

    const planes = cursos.map((c) => ({ c, plan: planificar(c) }));
    const cuenta = new Map<Accion, number>();
    const filas = [
      ['cursoId', 'postulanteId', 'curso', 'accion', 'detalle']
        .map(csv)
        .join(','),
    ];
    for (const { c, plan } of planes) {
      cuenta.set(plan.accion, (cuenta.get(plan.accion) ?? 0) + 1);
      filas.push(
        [
          c._id.toString(),
          c.postulanteId?.toString() ?? '',
          c.nombreCurso,
          plan.accion,
          plan.nota,
        ]
          .map(csv)
          .join(','),
      );
      if (plan.$set) {
        console.log(
          `  ${plan.accion.padEnd(26)} ${c.nombreCurso} · ${plan.nota}`,
        );
      }
    }
    console.log(`\n${cursos.length} curso(s) sin origenVencimiento:`);
    for (const [accion, n] of cuenta) console.log(`  ${accion}: ${n}`);

    mkdirSync(resolve(__dirname, '../reportes-ia'), { recursive: true });
    const ruta = resolve(
      __dirname,
      `../reportes-ia/migracion-cursos-${new Date().toISOString().slice(0, 16).replace(':', '-')}.csv`,
    );
    writeFileSync(ruta, `\uFEFF${filas.join('\n')}\n`);
    console.log(`\nReporte: ${ruta}`);

    const aEscribir = planes.filter((p) => p.plan.$set);
    if (!ejecutar) {
      console.log(
        `\nDRY-RUN: no se escribió nada (${aEscribir.length} curso(s) cambiarían).`,
      );
      return;
    }
    await confirmarEscritura(nombreBase);
    let escritos = 0;
    for (const { c, plan } of aEscribir) {
      // Solo si el curso sigue como se leyó (nadie lo editó entretanto).
      const r = await col.updateOne(
        {
          _id: c._id,
          origenVencimiento: { $exists: false },
          fechaVencimiento: c.fechaVencimiento ?? null,
        },
        { $set: plan.$set! },
      );
      escritos += r.modifiedCount;
    }
    console.log(`\nActualizados: ${escritos} de ${aEscribir.length}.`);
  } finally {
    await desconectar();
  }
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('El script falló:', (err as Error).message);
    await desconectar();
    process.exit(1);
  });
}
