/**
 * Diagnóstico de SOLO LECTURA: corre la canalización actual de extracción
 * sobre los documentos personales de un postulante (buscado por nombre) y
 * muestra una tabla: documento | emisión | vencimiento | precisión | fuente |
 * confianza | revisar/motivo. No usa la caché ni escribe en la base ni en S3.
 *
 * Llama a OpenAI (doble lectura por imagen/escaneo): tiene costo.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/probar-extraccion-postulante.ts --uri "<mongodb-uri>" \
 *     --nombre "Maria Fernanda Cervantes Obeso" [--tipo INE]
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Document, WithId } from 'mongodb';

import {
  CAMPOS_FECHA,
  extraerFechasDocPersonal,
  MIMES_EXTRACCION_IA,
  modeloDocsDesdeEnv,
  seedDesdeEnv,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import { configLecturaDesdeEnv } from '../src/modules/docs-personales/ia/lectura-documento';
import { formatearConPrecision } from '../src/modules/docs-personales/ia/formatos-fecha';
import { aConfianzaNumerica } from '../src/modules/docs-personales/ia/meta-fechas';
import { LABEL_TIPO_DOC } from '../src/modules/docs-personales/constants/tipos-doc-personal';
import type { TipoDocPersonal } from '../src/modules/docs-personales/constants/tipos-doc-personal';
import { conectar, desconectar, leerArgs } from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/probar-extraccion-postulante.ts --uri "<mongodb-uri>" --nombre "<nombre completo>" [--tipo <tipo>]`;

function leerEntorno(): Record<string, string> {
  const ruta = resolve(__dirname, '../.env');
  const archivo = existsSync(ruta) ? parseDotenv(readFileSync(ruta)) : {};
  const env: Record<string, string> = {};
  for (const k of new Set([
    ...Object.keys(process.env),
    ...Object.keys(archivo),
  ])) {
    if (k === 'MONGODB_URI') continue; // la URI solo por --uri
    const v = process.env[k] ?? archivo[k];
    if (v) env[k] = v;
  }
  return env;
}

const normal = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function main() {
  const { uri, flags } = leerArgs(USO);
  const nombre = flags.get('nombre');
  if (typeof nombre !== 'string') {
    console.error(USO);
    process.exit(2);
  }
  const env = leerEntorno();
  const leer = (k: string) => env[k];
  const { db } = await conectar(uri);
  try {
    // Usuario por nombre + apellidos (sin acentos ni mayúsculas).
    const buscado = normal(nombre);
    const usuarios = await db
      .collection('usuarios')
      .find({}, { projection: { nombre: 1, apellidos: 1 } })
      .toArray();
    const usuario = usuarios.find(
      (u) => normal(`${u.nombre ?? ''} ${u.apellidos ?? ''}`) === buscado,
    );
    if (!usuario) throw new Error(`No se encontró el usuario "${nombre}".`);
    const postulante = await db
      .collection('postulantes')
      .findOne({ usuarioId: usuario._id });
    if (!postulante)
      throw new Error('El usuario no tiene perfil de postulante.');

    const filtro: Document = { postulanteId: postulante._id };
    const tipo = flags.get('tipo');
    if (typeof tipo === 'string') filtro.tipo = tipo;
    const docs = (await db
      .collection('docs_personales')
      .find(filtro)
      .sort({ tipo: 1, subidasEn: 1 })
      .toArray()) as Array<
      WithId<Document> & {
        tipo: TipoDocPersonal;
        tipoMime: string;
        nombreOriginal: string;
        cloudinaryPublicId?: string;
      }
    >;
    const modelo = modeloDocsDesdeEnv(leer);
    console.log(
      `${docs.length} documento(s) · modelo ${modelo} · sin caché, sin escribir\n`,
    );

    const s3 = new S3Client({
      region: env.AWS_REGION ?? 'us-east-2',
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });

    const filas: string[][] = [];
    for (const d of docs) {
      const etiqueta = `${LABEL_TIPO_DOC[d.tipo] ?? d.tipo} (${d.nombreOriginal})`;
      if (!d.cloudinaryPublicId || !MIMES_EXTRACCION_IA.includes(d.tipoMime)) {
        filas.push([
          etiqueta,
          '—',
          '—',
          '—',
          '—',
          '—',
          'archivo no disponible o formato no compatible',
        ]);
        continue;
      }
      const obj = await s3.send(
        new GetObjectCommand({
          Bucket: env.AWS_S3_BUCKET,
          Key: d.cloudinaryPublicId,
        }),
      );
      const buffer = Buffer.from(await obj.Body!.transformToByteArray());
      const r = await extraerFechasDocPersonal({
        buffer,
        mimeType: d.tipoMime,
        tipo: d.tipo,
        apiKey: env.OPENAI_API_KEY ?? '',
        modelo,
        lectura: configLecturaDesdeEnv(leer),
        seed: seedDesdeEnv(leer),
        onError: (m) => console.error(`  [error] ${m}`),
      });
      const res = r.resultado;
      if (res.errorMensaje) {
        filas.push([
          etiqueta,
          '—',
          '—',
          '—',
          '—',
          '—',
          `ERROR: ${res.errorMensaje}`,
        ]);
        continue;
      }
      const mostrar = (c: (typeof CAMPOS_FECHA)[number]) =>
        res[c]
          ? (formatearConPrecision(res[c], res.detalle?.[c].precision) ??
            res[c])
          : '—';
      const precision = (['fechaEmision', 'fechaVencimiento'] as const)
        .map((c) => (res[c] ? res.detalle?.[c].precision : '—'))
        .join(' / ');
      const fuente = (['fechaEmision', 'fechaVencimiento'] as const)
        .map((c) => (res[c] ? (res.fuentes?.[c]?.fuente ?? 'ia') : '—'))
        .join(' / ');
      const confianza = (['fechaEmision', 'fechaVencimiento'] as const)
        .map((c) =>
          res[c] ? String(aConfianzaNumerica(res.confianza[c])) : '—',
        )
        .join(' / ');
      const revisar = res.revisar
        ? `Sí: ${(res.motivosRevision ?? []).join(' | ')}`
        : 'No';
      const extra = [
        res.noVence ? 'no vence' : null,
        res.tipoSospechoso
          ? `tipo detectado: ${res.tipoSospechoso.tipoDetectado}`
          : null,
        res.fechasDescartadas?.length
          ? `descartadas: ${res.fechasDescartadas.join(' | ')}`
          : null,
        res.consenso
          ? `consenso venc: ${res.consenso.fechaVencimiento.estado}`
          : null,
      ]
        .filter(Boolean)
        .join('; ');
      filas.push([
        etiqueta,
        mostrar('fechaEmision'),
        mostrar('fechaVencimiento'),
        precision,
        fuente,
        confianza,
        revisar + (extra ? ` (${extra})` : ''),
      ]);
      console.log(`  listo: ${etiqueta}`);
    }

    console.log(
      '\n| Documento | Emisión | Vencimiento | Precisión (emi/venc) | Fuente (emi/venc) | Confianza (emi/venc) | Revisar / motivo |',
    );
    console.log('|---|---|---|---|---|---|---|');
    for (const f of filas)
      console.log(`| ${f.map((x) => x.replace(/\|/g, '/')).join(' | ')} |`);
  } finally {
    await desconectar();
  }
}

main().catch(async (err) => {
  console.error('El script falló:', (err as Error).message);
  await desconectar();
  process.exit(1);
});
