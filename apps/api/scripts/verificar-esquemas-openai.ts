/**
 * Verifica contra OpenAI que los esquemas estrictos (Structured Outputs)
 * sean aceptados por el modelo configurado: documentos (Chat Completions),
 * respaldo pdf-crudo (Responses API) y CV. Usa una imagen y un PDF
 * sintéticos, sin datos personales. Hace 4 llamadas pequeñas.
 *
 * Uso (desde apps/api):
 *   npx ts-node scripts/verificar-esquemas-openai.ts
 */
import 'dotenv/config';
import { createCanvas } from '@napi-rs/canvas';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';

import {
  extraerFechasDocPersonal,
  modeloDocsDesdeEnv,
  seedDesdeEnv,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import { formatoResponses } from '../src/modules/docs-personales/ia/esquema-respuesta';
import { FORMATO_CV } from '../src/modules/ingest-ia/esquema-cv';
import { MODELO_GENERAL_POR_DEFECTO } from '../src/common/utils/openai-client.util';

const env = process.env as Record<string, string | undefined>;
const apiKey = env.OPENAI_API_KEY ?? '';
const modelo = modeloDocsDesdeEnv((k) => env[k]);

/** Constancia ficticia (sin datos reales). */
const LINEAS = [
  'CONSTANCIA DE EJEMPLO',
  'Nombre: PERSONA DE PRUEBA',
  'Fecha de expedición: 10/05/2019',
  'Fecha de vencimiento: 09/05/2029',
];

function imagen(): Buffer {
  const c = createCanvas(1200, 500);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1200, 500);
  ctx.fillStyle = '#000';
  ctx.font = '40px sans-serif';
  LINEAS.forEach((l, i) => ctx.fillText(l, 60, 90 + i * 100));
  return c.toBuffer('image/png');
}

function pdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.fontSize(18);
    LINEAS.forEach((l) => doc.text(l).moveDown());
    doc.end();
  });
}

async function main() {
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY');
  console.log(`Modelo de documentos: ${modelo}`);

  // 1. Chat Completions + json_schema (doble lectura sobre imagen).
  const r = await extraerFechasDocPersonal({
    buffer: imagen(),
    mimeType: 'image/png',
    tipo: 'certificado_competencia',
    apiKey,
    modelo,
    seed: seedDesdeEnv((k) => env[k]),
    onError: (m) => console.error(`  [error] ${m}`),
  });
  console.log('\n1) Documento (imagen, doble lectura):');
  console.log(
    `   error: ${r.resultado.errorMensaje ?? 'ninguno'} · emisión ${r.resultado.fechaEmision} · vencimiento ${r.resultado.fechaVencimiento}`,
  );
  console.log(
    `   lecturas: ${(r.resultado.lecturasIa ?? []).map((l) => l.id).join(', ')} · consenso venc: ${r.resultado.consenso?.fechaVencimiento.estado ?? '—'} · confianza ${r.resultado.confianza.fechaVencimiento}`,
  );

  // 2. Responses API + text.format json_schema (respaldo pdf-crudo).
  const respuesta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'documento.pdf',
              file_data: `data:application/pdf;base64,${(await pdf()).toString('base64')}`,
            },
            { type: 'input_text', text: 'Extrae las fechas del documento.' },
          ],
        },
      ],
      text: { format: formatoResponses('certificado_competencia') },
      temperature: 0,
      max_output_tokens: 1200,
    }),
  });
  const cuerpo = (await respuesta.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  };
  const texto =
    cuerpo.output_text ??
    cuerpo.output
      ?.flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? '')
      .join('');
  console.log('\n2) Respaldo pdf-crudo (Responses API):');
  console.log(
    respuesta.ok
      ? `   OK · vencimiento ${(JSON.parse(texto ?? '{}') as { fechaVencimiento?: { valor?: string } }).fechaVencimiento?.valor}`
      : `   ERROR HTTP ${respuesta.status}: ${cuerpo.error?.message}`,
  );

  // 3. Esquema del CV.
  const openai = new OpenAI({ apiKey });
  const modeloCv = env.OPENAI_MODEL?.trim() || MODELO_GENERAL_POR_DEFECTO;
  const cv = await openai.chat.completions.create({
    model: modeloCv,
    response_format: FORMATO_CV,
    messages: [
      {
        role: 'user',
        content:
          'CV de ejemplo: PERSONA DE PRUEBA. Curso: Formación básica en seguridad, expedido el 10/05/2019, vigencia hasta 09/05/2024.',
      },
    ],
    temperature: 0,
    seed: seedDesdeEnv((k) => env[k]),
    max_tokens: 800,
  });
  const datos = JSON.parse(cv.choices[0]?.message?.content ?? '{}') as {
    cursos?: Array<{ nombre?: string; fechaVencimiento?: string }>;
  };
  console.log(`\n3) CV (${modeloCv}):`);
  console.log(`   OK · cursos: ${JSON.stringify(datos.cursos)}`);
}

main().catch((err: Error & { status?: number }) => {
  console.error(
    `FALLÓ${err.status ? ` (HTTP ${err.status})` : ''}: ${err.message}`,
  );
  process.exit(1);
});
