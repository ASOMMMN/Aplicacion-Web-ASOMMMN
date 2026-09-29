/**
 * Re-extrae con IA las fechas de documentos personales que se subieron antes
 * de que existiera la extracción automática (25-sep-2026) y no tienen
 * ninguna fecha (inicio, emisión ni vencimiento).
 *
 * - Usa la MISMA función que la app (src/modules/docs-personales/ia/
 *   extraer-fechas-doc-personal.ts); no levanta Nest (evita el seed del
 *   admin y los cron jobs).
 * - Solo escribe fechas que el modelo encontró; nunca borra ni sobrescribe
 *   fechas existentes (el update exige que sigan vacías).
 * - --dry-run (por defecto) NO llama a OpenAI: cuenta y estima costo.
 *
 * Variables de entorno (del proceso o, si faltan, de apps/api/.env; de ese
 * archivo solo se leen estas, nunca MONGODB_URI):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET,
 *   OPENAI_API_KEY, OPENAI_MODEL
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/backfill-fechas-docs-personales.ts --uri "<mongodb-uri>" \
 *     [--precio-entrada 0.15 --precio-salida 0.60] [--analizar-pdf]
 *   npx ts-node apps/api/scripts/backfill-fechas-docs-personales.ts --uri "<mongodb-uri>" \
 *     --ejecutar [--lote 20] [--pausa 1500] [--limite 50]
 *
 * Opciones:
 *   --uri <uri>             Obligatorio. No se lee de .env.
 *   --ejecutar              Llama a OpenAI y escribe. Sin él: dry-run.
 *   --lote <n>              Documentos por lote (20).
 *   --pausa <ms>            Pausa entre llamadas a OpenAI (1500).
 *   --limite <n>            Procesa como máximo n documentos.
 *   --analizar-pdf          Dry-run: descarga los PDF de S3 para distinguir
 *                           texto/escaneado y estimar mejor (no llama a OpenAI).
 *   --precio-entrada <usd>  USD por 1M tokens de entrada del modelo.
 *   --precio-salida <usd>   USD por 1M tokens de salida. Sin precios se
 *                           imprimen solo tokens (consulta la página de
 *                           precios de OpenAI para OPENAI_MODEL).
 *   --tokens-imagen <n>     Supuesto de tokens por imagen (5000).
 *   --tokens-pdf-visual <n> Supuesto de tokens por PDF escaneado (8000).
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import type { Document, WithId } from 'mongodb';

import {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  construirPromptPdfEscaneado,
  extraerFechasDocPersonal,
  extraerTextoPdf,
  MAX_CARACTERES_PDF_TEXTO,
  MIMES_EXTRACCION_IA,
  MIN_CARACTERES_PDF_TEXTO,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import type { TipoDocPersonal } from '../src/modules/docs-personales/constants/tipos-doc-personal';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
  numeroFlag,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/backfill-fechas-docs-personales.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]
  (ver cabecera del archivo para el resto de opciones)`;

const CARACTERES_POR_TOKEN = 4; // aproximación para español/inglés
const TOKENS_SALIDA_POR_DOC = 150; // JSON de 3 fechas + confianza

type Categoria = 'pdf' | 'pdf-texto' | 'pdf-visual' | 'imagen';

interface DocPendiente extends WithId<Document> {
  tipo: TipoDocPersonal;
  tipoMime: string;
  nombreOriginal: string;
  cloudinaryPublicId?: string;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tokens = (texto: string) =>
  Math.ceil(texto.length / CARACTERES_POR_TOKEN);

/** Lee solo las variables permitidas: proceso primero, luego apps/api/.env. */
function leerEntorno(): Record<string, string> {
  const permitidas = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
  ];
  const ruta = resolve(__dirname, '../.env');
  const archivo = existsSync(ruta) ? parseDotenv(readFileSync(ruta)) : {};
  const env: Record<string, string> = {};
  for (const k of permitidas) {
    const v = process.env[k] ?? archivo[k];
    if (v) env[k] = v;
  }
  return env;
}

async function descargar(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!r.Body) throw new Error('Objeto vacío');
  return Buffer.from(await r.Body.transformToByteArray());
}

async function main() {
  const { uri, ejecutar, flags } = leerArgs(USO);
  // Lo primero que se imprime: host y base (lo hace conectar()).
  const { db, nombreBase } = await conectar(uri);

  const lote = Math.max(1, numeroFlag(flags, 'lote', 20));
  const pausa = numeroFlag(flags, 'pausa', 1500);
  const limite = flags.has('limite')
    ? numeroFlag(flags, 'limite', 0)
    : Infinity;
  const precioEntrada = flags.has('precio-entrada')
    ? numeroFlag(flags, 'precio-entrada', 0)
    : null;
  const precioSalida = flags.has('precio-salida')
    ? numeroFlag(flags, 'precio-salida', 0)
    : null;
  const tokensImagen = numeroFlag(flags, 'tokens-imagen', 5000);
  const tokensPdfVisual = numeroFlag(flags, 'tokens-pdf-visual', 8000);
  const analizarPdf = flags.has('analizar-pdf');

  const env = leerEntorno();
  const bucket = env.AWS_S3_BUCKET ?? '';
  const modelo = env.OPENAI_MODEL ?? 'gpt-4o-mini';
  console.log(`Bucket S3: ${bucket || '(no configurado)'} · Modelo: ${modelo}`);
  console.log(
    `Modo: ${ejecutar ? 'EJECUTAR (llama a OpenAI y escribe)' : 'DRY-RUN (no llama a OpenAI, no escribe)'}\n`,
  );

  // ── Documentos pendientes ───────────────────────────────────────────────
  const col = db.collection('docs_personales');
  const sinFechas = {
    fechaInicio: { $in: [null] },
    fechaEmision: { $in: [null] },
    fechaVencimiento: { $in: [null] },
  };
  const todos = (await col
    .find(sinFechas, {
      projection: {
        tipo: 1,
        tipoMime: 1,
        nombreOriginal: 1,
        storageType: 1,
        cloudinaryPublicId: 1,
      },
    })
    .sort({ subidasEn: 1 })
    .toArray()) as DocPendiente[];

  const noDescargables = todos.filter(
    (d) => d.storageType !== 'cloudinary' || !d.cloudinaryPublicId,
  );
  const noSoportados = todos.filter(
    (d) =>
      !noDescargables.includes(d) && !MIMES_EXTRACCION_IA.includes(d.tipoMime),
  );
  const pendientes = todos
    .filter((d) => !noDescargables.includes(d) && !noSoportados.includes(d))
    .slice(0, limite);

  console.log(`Documentos sin ninguna fecha: ${todos.length}`);
  console.log(
    `  - no descargables (almacenamiento local antiguo): ${noDescargables.length}`,
  );
  console.log(`  - formato no soportado por la IA: ${noSoportados.length}`);
  console.log(
    `  - a procesar: ${pendientes.length}${Number.isFinite(limite) ? ` (--limite ${limite})` : ''}`,
  );

  const porTipo = new Map<string, number>();
  for (const d of pendientes)
    porTipo.set(d.tipo, (porTipo.get(d.tipo) ?? 0) + 1);
  console.log('\nPor tipo:');
  for (const [tipo, n] of [...porTipo].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tipo.padEnd(28)} ${n}`);
  }

  // ── Estimación (sin OpenAI) ─────────────────────────────────────────────
  const s3 = new S3Client({
    region: env.AWS_REGION ?? 'us-east-2',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  const porCategoria = new Map<Categoria, number>();
  let tokensEntrada = 0;
  for (const d of pendientes) {
    let categoria: Categoria;
    let entrada: number;
    if (d.tipoMime !== 'application/pdf') {
      categoria = 'imagen';
      entrada =
        tokens(
          SYSTEM_PROMPT_DOC_PERSONAL + construirPromptImagenDocPersonal(d.tipo),
        ) + tokensImagen;
    } else if (analizarPdf) {
      try {
        const texto = await extraerTextoPdf(
          await descargar(s3, bucket, d.cloudinaryPublicId!),
        );
        if (texto.length < MIN_CARACTERES_PDF_TEXTO) {
          categoria = 'pdf-visual';
          entrada =
            tokens(
              SYSTEM_PROMPT_DOC_PERSONAL + construirPromptPdfEscaneado(d.tipo),
            ) + tokensPdfVisual;
        } else {
          categoria = 'pdf-texto';
          entrada = tokens(
            SYSTEM_PROMPT_DOC_PERSONAL +
              construirPromptDocPersonal(
                texto.slice(0, MAX_CARACTERES_PDF_TEXTO),
                d.tipo,
              ),
          );
        }
      } catch (err) {
        console.warn(
          `  ! No se pudo descargar ${String(d._id)}: ${(err as Error).message}`,
        );
        continue;
      }
    } else {
      // Sin analizar: se asume el peor caso (escaneado).
      categoria = 'pdf';
      entrada =
        tokens(
          SYSTEM_PROMPT_DOC_PERSONAL + construirPromptPdfEscaneado(d.tipo),
        ) + tokensPdfVisual;
    }
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);
    tokensEntrada += entrada;
  }
  const tokensSalida = pendientes.length * TOKENS_SALIDA_POR_DOC;

  console.log('\nPor formato:');
  for (const [cat, n] of porCategoria) {
    const nota =
      cat === 'pdf'
        ? ' (sin --analizar-pdf: se estima como escaneado, peor caso)'
        : '';
    console.log(`  ${cat.padEnd(12)} ${n}${nota}`);
  }
  console.log(
    `\nEstimado: ~${tokensEntrada.toLocaleString('es-MX')} tokens de entrada · ~${tokensSalida.toLocaleString('es-MX')} de salida`,
  );
  console.log(
    `  (supuestos: ${CARACTERES_POR_TOKEN} caracteres/token, ${tokensImagen} tokens/imagen, ${tokensPdfVisual} tokens/PDF escaneado)`,
  );
  if (precioEntrada !== null && precioSalida !== null) {
    const costo =
      (tokensEntrada * precioEntrada + tokensSalida * precioSalida) / 1_000_000;
    console.log(`  Costo estimado: ~USD ${costo.toFixed(4)}`);
  } else {
    console.log(
      '  Para estimar el costo en USD pasa --precio-entrada y --precio-salida (USD por 1M tokens de OPENAI_MODEL).',
    );
  }
  console.log(
    `  Duración mínima por pausas: ~${Math.ceil((pendientes.length * pausa) / 60000)} min`,
  );

  if (!ejecutar) {
    console.log(
      '\nDRY-RUN: no se llamó a OpenAI ni se escribió nada. Usa --ejecutar para procesar.',
    );
    await desconectar();
    return;
  }

  // ── Ejecución ───────────────────────────────────────────────────────────
  if (pendientes.length === 0) {
    console.log('\nNada que procesar.');
    await desconectar();
    return;
  }
  if (!env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');
  if (!bucket) throw new Error('Falta AWS_S3_BUCKET.');

  await confirmarEscritura(nombreBase);

  const dirLogs = resolve(__dirname, '../logs');
  mkdirSync(dirLogs, { recursive: true });
  const rutaLog = resolve(
    dirLogs,
    `backfill-fechas-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
  );
  console.log(`\nRegistro por documento (JSON por línea): ${rutaLog}\n`);
  const registrar = (entrada: Record<string, unknown>) =>
    appendFileSync(
      rutaLog,
      `${JSON.stringify({ ts: new Date().toISOString(), ...entrada })}\n`,
    );

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const totales = { actualizados: 0, sinFechas: 0, errores: 0 };
  let detener = false;

  for (let i = 0; i < pendientes.length && !detener; i += lote) {
    const grupo = pendientes.slice(i, i + lote);
    console.log(
      `Lote ${i / lote + 1} (${i + 1}–${i + grupo.length} de ${pendientes.length})`,
    );

    for (const d of grupo) {
      const id = String(d._id);
      let buffer: Buffer;
      try {
        buffer = await descargar(s3, bucket, d.cloudinaryPublicId!);
      } catch (err) {
        totales.errores++;
        registrar({
          id,
          tipo: d.tipo,
          estado: 'error-descarga',
          error: (err as Error).message,
        });
        console.log(`  ✗ ${id} ${d.tipo}: no se pudo descargar`);
        continue;
      }

      const { resultado, origen } = await extraerFechasDocPersonal({
        buffer,
        mimeType: d.tipoMime,
        tipo: d.tipo,
        apiKey: env.OPENAI_API_KEY,
        modelo,
        openai,
        onError: (m) => console.error(`    ${m}`),
      });

      if (resultado.errorMensaje) {
        totales.errores++;
        registrar({
          id,
          tipo: d.tipo,
          origen,
          estado: 'error-ia',
          error: resultado.errorMensaje,
        });
        console.log(`  ✗ ${id} ${d.tipo}: ${resultado.errorMensaje}`);
        // Sin crédito o key inválida: no tiene caso seguir.
        if (/API key|cuota/i.test(resultado.errorMensaje)) {
          console.log('\nDetenido: error de credenciales/cuota de OpenAI.');
          detener = true;
          break;
        }
      } else {
        const set: Record<string, Date> = {};
        if (resultado.fechaInicio)
          set.fechaInicio = new Date(`${resultado.fechaInicio}T00:00:00.000Z`);
        if (resultado.fechaEmision)
          set.fechaEmision = new Date(
            `${resultado.fechaEmision}T00:00:00.000Z`,
          );
        if (resultado.fechaVencimiento)
          set.fechaVencimiento = new Date(
            `${resultado.fechaVencimiento}T00:00:00.000Z`,
          );

        if (Object.keys(set).length === 0) {
          totales.sinFechas++;
          registrar({ id, tipo: d.tipo, origen, estado: 'sin-fechas' });
          console.log(`  · ${id} ${d.tipo}: el documento no muestra fechas`);
        } else {
          // Solo si sigue sin fechas (no pisa algo escrito mientras corría).
          const r = await col.updateOne(
            { _id: d._id, ...sinFechas },
            { $set: set },
          );
          totales.actualizados += r.modifiedCount;
          registrar({
            id,
            tipo: d.tipo,
            origen,
            estado: r.modifiedCount ? 'actualizado' : 'omitido-ya-tenia-fechas',
            fechas: resultado,
          });
          console.log(
            `  ✓ ${id} ${d.tipo}: ${Object.entries(set)
              .map(([k, v]) => `${k}=${v.toISOString().slice(0, 10)}`)
              .join(' ')}`,
          );
        }
      }

      await dormir(pausa);
    }
  }

  console.log(
    `\nFin: ${totales.actualizados} actualizado(s), ${totales.sinFechas} sin fechas visibles, ${totales.errores} error(es).`,
  );
  await desconectar();
}

main().catch(async (err) => {
  console.error('El script falló:', err);
  await desconectar().catch(() => undefined);
  process.exit(1);
});
