/**
 * Reanálisis en lote de documentos personales analizados con una versión
 * anterior de la canalización (analisisIa.versionCanalizacion distinta de la
 * actual o ausente), en dos pasos:
 *
 * 1. DRY-RUN (por defecto): descarga cada archivo de S3, lo analiza con la
 *    canalización actual (SÍ llama a OpenAI) y NO escribe en la base. Genera
 *    un reporte con las fechas que cambiarían (anterior → nueva):
 *      apps/api/reportes-ia/reanalisis-<fecha>.json  (resultados completos)
 *      apps/api/reportes-ia/reanalisis-<fecha>.csv   (una fila por fecha)
 *    La carpeta reportes-ia/ está en .gitignore: contiene datos personales.
 *
 * 2. --ejecutar --reporte <ruta.json>: aplica EXACTAMENTE los resultados
 *    revisados (no vuelve a llamar a OpenAI). Usa las mismas reglas que la
 *    app (ia/cambios-analisis.ts): nunca pisa una fecha con null; la versión
 *    vieja se reemplaza y queda registrada. Se salta los documentos que
 *    cambiaron desde el reporte (verificados por un evaluador, fechas
 *    distintas o analizados después). Registra auditoría por documento.
 *
 * Nunca toca documentos con fechas verificadas por el evaluador.
 *
 * Variables de entorno (del proceso o, si faltan, de apps/api/.env; de ese
 * archivo solo se leen estas, nunca MONGODB_URI):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET,
 *   OPENAI_API_KEY, OPENAI_MODEL_DOCS, OPENAI_SEED, IA_DOCS_*
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/reanalizar-docs-personales.ts --uri "<mongodb-uri>" \
 *     [--limite 20] [--tipo INE] [--postulante <id>] [--pausa 1500]
 *   npx ts-node apps/api/scripts/reanalizar-docs-personales.ts --uri "<mongodb-uri>" \
 *     --ejecutar --reporte apps/api/reportes-ia/reanalisis-2026-10-05T12-00.json \
 *     --actor-email admin@ejemplo.mx
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectId, type Document, type WithId } from 'mongodb';

import {
  CAMPOS_FECHA,
  extraerFechasDocPersonal,
  MIMES_EXTRACCION_IA,
  modeloDocsDesdeEnv,
  ResultadoExtraccionFechas,
  seedDesdeEnv,
  VERSION_CANALIZACION,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import { configLecturaDesdeEnv } from '../src/modules/docs-personales/ia/lectura-documento';
import {
  CambiosAnalisis,
  cambiosPorAnalisis,
} from '../src/modules/docs-personales/ia/cambios-analisis';
import type { TipoDocPersonal } from '../src/modules/docs-personales/constants/tipos-doc-personal';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
  numeroFlag,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/reanalizar-docs-personales.ts --uri "<mongodb-uri>" [--limite n] [--tipo t] [--postulante id]
  npx ts-node apps/api/scripts/reanalizar-docs-personales.ts --uri "<mongodb-uri>" --ejecutar --reporte <ruta.json> --actor-email <email>`;

const CARPETA_REPORTES = resolve(__dirname, '../reportes-ia');

interface DocBase extends WithId<Document> {
  postulanteId?: ObjectId;
  tipo: TipoDocPersonal;
  tipoMime: string;
  nombreOriginal: string;
  cloudinaryPublicId?: string;
  fechaEmision?: Date | null;
  fechaInicio?: Date | null;
  fechaVencimiento?: Date | null;
  precisionFechas?: Record<string, 'dia' | 'mes' | 'anio'>;
  detalleFechasIa?: Record<string, unknown> | null;
  analisisIa?: { analizadoEn?: Date; versionCanalizacion?: string } | null;
  fechasVerificadas?: unknown;
}

interface EntradaReporte {
  id: string;
  postulanteId: string | null;
  tipo: string;
  nombreOriginal: string;
  anterior: Record<string, string | null>;
  analizadoAntesEn: string | null;
  resultado: ResultadoExtraccionFechas;
}

interface Reporte {
  generadoEn: string;
  base: string;
  versionCanalizacion: string;
  modelo: string;
  documentos: EntradaReporte[];
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d?: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

function leerEntorno(): Record<string, string> {
  const ruta = resolve(__dirname, '../.env');
  const archivo = existsSync(ruta) ? parseDotenv(readFileSync(ruta)) : {};
  const env: Record<string, string> = {};
  const permitida = (k: string) =>
    [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'AWS_S3_BUCKET',
      'OPENAI_API_KEY',
      'OPENAI_MODEL_DOCS',
      'OPENAI_SEED',
    ].includes(k) || k.startsWith('IA_DOCS_');
  for (const k of new Set([
    ...Object.keys(process.env),
    ...Object.keys(archivo),
  ])) {
    if (!permitida(k)) continue;
    const v = process.env[k] ?? archivo[k];
    if (v) env[k] = v;
  }
  return env;
}

/** Qué pasaría con cada fecha (para el reporte). */
function clasificar(
  anterior: string | null,
  cambios: CambiosAnalisis,
  campo: (typeof CAMPOS_FECHA)[number],
): { accion: string; nueva: string | null } {
  const final = iso(cambios[campo] ?? null);
  const propuesta = cambios.propuestaFechasIa?.fechas[campo];
  if (propuesta) return { accion: 'propuesta', nueva: iso(propuesta.valor) };
  if (cambios.analisisIa.conservadas?.some((c) => c.campo === campo)) {
    return {
      accion: 'conserva (la nueva lectura no la encontró)',
      nueva: null,
    };
  }
  if (anterior === final) return { accion: 'igual', nueva: final };
  if (!anterior) return { accion: 'nueva', nueva: final };
  return { accion: 'reemplaza', nueva: final };
}

const csv = (v: string | null | undefined) =>
  `"${String(v ?? '').replace(/"/g, '""')}"`;

async function dryRun(
  db: Awaited<ReturnType<typeof conectar>>['db'],
  nombreBase: string,
  flags: Map<string, string | true>,
) {
  const env = leerEntorno();
  const leer = (k: string) => env[k];
  const modelo = modeloDocsDesdeEnv(leer);
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('Falta AWS_S3_BUCKET.');
  if (!env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');

  const filtro: Document = {
    fechasVerificadas: null,
    storageType: 'cloudinary',
    cloudinaryPublicId: { $exists: true, $ne: null },
    tipoMime: { $in: MIMES_EXTRACCION_IA },
    'analisisIa.versionCanalizacion': { $ne: VERSION_CANALIZACION },
  };
  const tipo = flags.get('tipo');
  if (typeof tipo === 'string') filtro.tipo = tipo;
  const postulante = flags.get('postulante');
  if (typeof postulante === 'string')
    filtro.postulanteId = new ObjectId(postulante);
  const limite = flags.has('limite') ? numeroFlag(flags, 'limite', 0) : 0;
  const pausa = numeroFlag(flags, 'pausa', 1500);

  const docs = (await db
    .collection('docs_personales')
    .find(filtro)
    .sort({ subidasEn: 1 })
    .limit(limite)
    .toArray()) as DocBase[];
  console.log(
    `\n${docs.length} documento(s) analizados con otra versión (actual: ${VERSION_CANALIZACION}) · modelo ${modelo}`,
  );
  console.log('DRY-RUN: se llama a OpenAI pero NO se escribe en la base.\n');

  const s3 = new S3Client({
    region: env.AWS_REGION ?? 'us-east-2',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  const reporte: Reporte = {
    generadoEn: new Date().toISOString(),
    base: nombreBase,
    versionCanalizacion: VERSION_CANALIZACION,
    modelo,
    documentos: [],
  };
  const filas: string[] = [
    [
      'docId',
      'postulanteId',
      'tipo',
      'archivo',
      'campo',
      'anterior',
      'nueva',
      'accion',
      'revisar',
      'motivos',
    ]
      .map(csv)
      .join(','),
  ];
  const cuenta: Record<string, number> = {};

  for (const [i, doc] of docs.entries()) {
    const etiqueta = `[${i + 1}/${docs.length}] ${doc.tipo} · ${doc.nombreOriginal}`;
    let buffer: Buffer;
    try {
      const r = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: doc.cloudinaryPublicId! }),
      );
      buffer = Buffer.from(await r.Body!.transformToByteArray());
    } catch (err) {
      console.log(
        `${etiqueta}: no se pudo descargar (${(err as Error).message})`,
      );
      continue;
    }
    const r = await extraerFechasDocPersonal({
      buffer,
      mimeType: doc.tipoMime,
      tipo: doc.tipo,
      apiKey: env.OPENAI_API_KEY,
      modelo,
      lectura: configLecturaDesdeEnv(leer),
      seed: seedDesdeEnv(leer),
      onError: (m) => console.error(`  [error] ${m}`),
    });
    const anterior = Object.fromEntries(
      CAMPOS_FECHA.map((c) => [c, iso(doc[c])]),
    );
    reporte.documentos.push({
      id: doc._id.toString(),
      postulanteId: doc.postulanteId?.toString() ?? null,
      tipo: doc.tipo,
      nombreOriginal: doc.nombreOriginal,
      anterior,
      analizadoAntesEn: doc.analisisIa?.analizadoEn
        ? new Date(doc.analisisIa.analizadoEn).toISOString()
        : null,
      resultado: r,
    });

    const cambios = cambiosPorAnalisis(r, { anterior: doc });
    if (!cambios || r.resultado.errorMensaje) {
      console.log(
        `${etiqueta}: ERROR ${r.resultado.errorMensaje ?? 'límite por minuto'}`,
      );
      cuenta.error = (cuenta.error ?? 0) + 1;
    } else {
      const partes: string[] = [];
      for (const c of CAMPOS_FECHA) {
        const { accion, nueva } = clasificar(anterior[c], cambios, c);
        cuenta[accion] = (cuenta[accion] ?? 0) + 1;
        if (accion !== 'igual' && (anterior[c] || nueva)) {
          partes.push(
            `${c.replace('fecha', '')}: ${anterior[c] ?? '—'} → ${nueva ?? '—'} (${accion})`,
          );
        }
        filas.push(
          [
            doc._id.toString(),
            doc.postulanteId?.toString() ?? '',
            doc.tipo,
            doc.nombreOriginal,
            c,
            anterior[c] ?? '',
            nueva ?? '',
            accion,
            cambios.revisarFechas ? 'sí' : 'no',
            (cambios.motivosRevision ?? []).join(' | '),
          ]
            .map(csv)
            .join(','),
        );
      }
      console.log(
        `${etiqueta}: ${partes.length ? partes.join(' · ') : 'sin cambios'}`,
      );
    }
    if (pausa && i < docs.length - 1) await dormir(pausa);
  }

  mkdirSync(CARPETA_REPORTES, { recursive: true });
  const base = `reanalisis-${reporte.generadoEn.slice(0, 16).replace(':', '-')}`;
  const rutaJson = resolve(CARPETA_REPORTES, `${base}.json`);
  writeFileSync(rutaJson, JSON.stringify(reporte, null, 2));
  writeFileSync(
    resolve(CARPETA_REPORTES, `${base}.csv`),
    // BOM: Excel abre el CSV con acentos correctos.
    `\uFEFF${filas.join('\n')}\n`,
  );
  console.log('\nResumen por fecha:', cuenta);
  console.log(`\nReporte: ${rutaJson} (y .csv)`);
  console.log(
    'Revísalo y, si estás de acuerdo, aplica exactamente esos resultados con:\n' +
      `  --ejecutar --reporte "${rutaJson}" --actor-email <tu email>`,
  );
}

async function ejecutar(
  db: Awaited<ReturnType<typeof conectar>>['db'],
  nombreBase: string,
  flags: Map<string, string | true>,
) {
  const ruta = flags.get('reporte');
  const email = flags.get('actor-email');
  if (typeof ruta !== 'string' || typeof email !== 'string') {
    console.error(
      `--ejecutar necesita --reporte <ruta.json> y --actor-email <email>\n\n${USO}`,
    );
    process.exit(2);
  }
  const reporte = JSON.parse(readFileSync(resolve(ruta), 'utf8')) as Reporte;
  if (reporte.base !== nombreBase) {
    throw new Error(
      `El reporte es de la base "${reporte.base}", no de "${nombreBase}".`,
    );
  }
  if (reporte.versionCanalizacion !== VERSION_CANALIZACION) {
    throw new Error(
      `El reporte es de la versión ${reporte.versionCanalizacion}; la actual es ${VERSION_CANALIZACION}. Genera uno nuevo.`,
    );
  }
  const actor = await db.collection('usuarios').findOne({ email });
  if (!actor) throw new Error(`No existe el usuario ${email}.`);

  console.log(
    `\n${reporte.documentos.length} documento(s) en el reporte del ${reporte.generadoEn}.`,
  );
  await confirmarEscritura(nombreBase);

  const col = db.collection('docs_personales');
  let aplicados = 0;
  let saltados = 0;
  for (const e of reporte.documentos) {
    const doc = (await col.findOne({
      _id: new ObjectId(e.id),
    })) as DocBase | null;
    const motivoSalto = !doc
      ? 'ya no existe'
      : doc.fechasVerificadas
        ? 'ahora tiene fechas verificadas'
        : CAMPOS_FECHA.some((c) => iso(doc[c]) !== e.anterior[c])
          ? 'sus fechas cambiaron desde el reporte'
          : (doc.analisisIa?.analizadoEn
                ? new Date(doc.analisisIa.analizadoEn).toISOString()
                : null) !== e.analizadoAntesEn
            ? 'se analizó de nuevo desde el reporte'
            : null;
    if (motivoSalto) {
      console.log(`  Saltado ${e.tipo} · ${e.nombreOriginal}: ${motivoSalto}`);
      saltados++;
      continue;
    }
    const cambios = cambiosPorAnalisis(e.resultado, { anterior: doc! });
    if (!cambios) {
      saltados++;
      continue;
    }
    await col.updateOne({ _id: doc!._id }, { $set: cambios });
    await db.collection('auditoria').insertOne({
      actorId: actor._id,
      actorEmail: email,
      accion: e.resultado.resultado.errorMensaje
        ? 'doc_personal_extraccion_ia_error'
        : 'doc_personal_extraccion_ia',
      recurso: 'DocPersonal',
      recursoId: e.id,
      metadata: {
        disparadoPor: 'script_reanalisis',
        reporte: reporte.generadoEn,
        postulanteId: e.postulanteId,
        tipoDocumento: e.tipo,
        modelo: e.resultado.modelo,
        versionCanalizacion: VERSION_CANALIZACION,
        antes: e.anterior,
        despues: Object.fromEntries(
          CAMPOS_FECHA.map((c) => [c, iso(cambios[c] ?? null)]),
        ),
        reemplazo: cambios.analisisIa.reemplazo,
        conservadas: cambios.analisisIa.conservadas,
        propuesta: cambios.propuestaFechasIa ? true : undefined,
      },
      creadoEn: new Date(),
    });
    aplicados++;
  }
  console.log(`\nAplicados: ${aplicados} · saltados: ${saltados}`);
}

async function main() {
  const { uri, ejecutar: escribir, flags } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    if (escribir) await ejecutar(db, nombreBase, flags);
    else await dryRun(db, nombreBase, flags);
  } finally {
    await desconectar();
  }
}

main().catch(async (err) => {
  console.error('El script falló:', (err as Error).message);
  await desconectar();
  process.exit(1);
});
