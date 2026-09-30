/**
 * Prueba la extracción de fechas con un archivo local (PDF, JPG o PNG),
 * con la MISMA función que usa el servidor (lectura + prompts por tipo +
 * validación en código). No se conecta a la base ni escribe nada.
 *
 * Imprime: cuánto texto se extrajo, si se usó visión (imágenes de páginas),
 * la respuesta cruda del modelo, lo que propuso el modelo, el resultado
 * final tras la validación y el estado que se guardaría en el documento.
 *
 * Variables de entorno (del proceso o, si faltan, de apps/api/.env; de ese
 * archivo solo se leen estas): OPENAI_API_KEY, OPENAI_MODEL,
 * IA_DOCS_UMBRAL_TEXTO, IA_DOCS_MAX_PAGINAS, IA_DOCS_ANCHO_PX,
 * IA_DOCS_MAX_CARACTERES_TEXTO.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/probar-extraccion-archivo.ts <ruta> <tipo> [--modelo gpt-4o] [--mostrar-texto]
 *
 * Tipos: CURP, INE, acta_nacimiento, visa, pasaporte, vacuna_fiebre_amarilla,
 * constancia_participacion, certificado_medico, libreta_identidad_maritima,
 * certificado_competencia, refrendo.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

import {
  extraerFechasDocPersonal,
  ExtraerDocPersonalIaResponse,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import {
  configLecturaDesdeEnv,
  leerDocumento,
} from '../src/modules/docs-personales/ia/lectura-documento';
import { cambiosPorAnalisis } from '../src/modules/docs-personales/ia/cambios-analisis';
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../src/modules/docs-personales/constants/tipos-doc-personal';

const USO = `Uso:
  npx ts-node apps/api/scripts/probar-extraccion-archivo.ts <ruta> <tipo> [--modelo <modelo>] [--mostrar-texto]

Tipos: ${TIPOS_DOC_PERSONAL.join(', ')}`;

const MIMES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const DESCRIPCION_ORIGEN: Record<string, string> = {
  imagen: 'imagen enviada al modelo de visión',
  'pdf-texto': 'PDF con texto: texto + imagen de la primera página',
  'pdf-visual': 'PDF escaneado: páginas convertidas a imágenes',
  'pdf-crudo': 'no se pudo renderizar: PDF completo enviado a la Responses API',
};

/** Lee solo las variables permitidas: proceso primero, luego apps/api/.env. */
function leerEntorno(): Record<string, string> {
  const permitidas = [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'IA_DOCS_UMBRAL_TEXTO',
    'IA_DOCS_MAX_PAGINAS',
    'IA_DOCS_ANCHO_PX',
    'IA_DOCS_MAX_CARACTERES_TEXTO',
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

/**
 * Tamaño con el que OpenAI analiza la imagen: detail "high" la ajusta a
 * 2048×2048 y luego a 768 px de lado corto; "low", a 512×512.
 */
function tamanoQueVeOpenAI(
  w: number,
  h: number,
  bajo: boolean,
): [number, number] {
  if (bajo) {
    const e = Math.min(1, 512 / Math.max(w, h));
    return [Math.round(w * e), Math.round(h * e)];
  }
  const e1 = Math.min(1, 2048 / Math.max(w, h));
  const e2 = Math.min(1, 768 / Math.min(w * e1, h * e1));
  return [Math.round(w * e1 * e2), Math.round(h * e1 * e2)];
}

function salir(mensaje: string): never {
  console.error(`${mensaje}\n\n${USO}`);
  process.exit(1);
}

const titulo = (t: string) =>
  console.log(`\n── ${t} ${'─'.repeat(60 - t.length)}`);

function imprimirFechas(r: ExtraerDocPersonalIaResponse) {
  for (const campo of [
    'fechaEmision',
    'fechaInicio',
    'fechaVencimiento',
  ] as const) {
    const d = r.detalle?.[campo];
    console.log(
      `  ${campo.padEnd(17)} ${String(r[campo] ?? '—').padEnd(11)} confianza ${r.confianza[campo]}` +
        (d?.precision === 'anio' ? ' (solo año)' : '') +
        (d?.textoLiteral ? `  texto: "${d.textoLiteral}"` : '') +
        (d?.etiqueta ? `  etiqueta: "${d.etiqueta}"` : ''),
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const posicionales = args.filter(
    (a, i) => !a.startsWith('--') && args[i - 1] !== '--modelo',
  );
  const [rutaArg, tipoArg] = posicionales;
  if (!rutaArg || !tipoArg) salir('Faltan la ruta del archivo o el tipo.');

  const ruta = resolve(rutaArg);
  if (!existsSync(ruta)) salir(`No existe el archivo: ${ruta}`);
  const mimeType = MIMES[extname(ruta).toLowerCase()];
  if (!mimeType) salir('Formato no compatible: usa PDF, JPG o PNG.');
  if (!(TIPOS_DOC_PERSONAL as readonly string[]).includes(tipoArg)) {
    salir(`Tipo inválido: ${tipoArg}`);
  }
  const tipo = tipoArg as TipoDocPersonal;

  const env = leerEntorno();
  const iModelo = args.indexOf('--modelo');
  const modelo =
    (iModelo >= 0 ? args[iModelo + 1] : undefined) ??
    env.OPENAI_MODEL ??
    'gpt-4o-mini';
  const lectura = configLecturaDesdeEnv((k) => env[k]);
  const buffer = readFileSync(ruta);

  titulo('Archivo');
  console.log(`  ${ruta}`);
  console.log(
    `  ${mimeType}, ${(statSync(ruta).size / 1024).toFixed(1)} KB · tipo ${tipo} · modelo ${modelo}`,
  );
  console.log(
    `  OPENAI_API_KEY: ${env.OPENAI_API_KEY ? 'definida' : 'NO DEFINIDA'}`,
  );

  if (args.includes('--mostrar-texto') && mimeType === 'application/pdf') {
    const leido = await leerDocumento(buffer, mimeType, lectura);
    titulo('Texto extraído del PDF');
    console.log(leido.texto || '  (sin texto: PDF escaneado)');
  }

  const r = await extraerFechasDocPersonal({
    buffer,
    mimeType,
    tipo,
    apiKey: env.OPENAI_API_KEY ?? '',
    modelo,
    lectura,
    onError: (m) => console.error(`  [error] ${m}`),
  });

  titulo('Lectura');
  if (r.origen) {
    console.log(`  Modo: ${r.origen} (${DESCRIPCION_ORIGEN[r.origen]})`);
    console.log(
      `  Páginas leídas: ${r.paginasLeidas ?? '—'} de ${r.paginasTotales ?? '—'}`,
    );
    console.log(`  Texto extraído: ${r.caracteresTexto ?? 0} caracteres`);
    console.log(
      `  Visión: ${
        r.origen === 'pdf-crudo'
          ? 'sí (PDF completo a la Responses API)'
          : r.imagenesEnviadas
            ? `sí, ${r.imagenesEnviadas} imagen(es) enviadas`
            : 'no (solo texto)'
      }`,
    );
    for (const [i, img] of (r.imagenesDetalle ?? []).entries()) {
      const [w, h] = tamanoQueVeOpenAI(img.ancho, img.alto, img.parte === 0);
      console.log(
        `    Imagen ${i + 1}: página ${img.pagina}, ${
          img.parte === 0 ? 'vista general' : `parte ${img.parte}/${img.partes}`
        }, ${img.ancho}×${img.alto} px${img.rotacion ? `, girada ${img.rotacion}°` : ''} → el modelo la ve a ${w}×${h}`,
      );
    }
    if (r.aviso) console.log(`  Aviso: ${r.aviso}`);
  } else {
    console.log('  No se llegó a llamar al modelo.');
  }

  titulo('Respuesta cruda del modelo');
  console.log(r.respuestaCruda ?? '  (ninguna)');

  if (r.propuestaModelo) {
    titulo('Propuesta del modelo (antes de validar)');
    imprimirFechas(r.propuestaModelo);
  }

  const res = r.resultado;
  titulo('Resultado final (tras la validación)');
  if (res.errorMensaje) {
    console.log(`  ERROR: ${res.errorMensaje}`);
  } else {
    imprimirFechas(res);
    console.log(`  Revisar: ${res.revisar ? 'sí' : 'no'}`);
    for (const m of res.motivosRevision ?? []) console.log(`    · ${m}`);
    for (const m of res.fechasDescartadas ?? [])
      console.log(`  Descartada: ${m}`);
    if (res.tipoSospechoso) {
      console.log(
        `  Tipo sospechoso: elegido ${res.tipoSospechoso.tipoElegido}, parece ${res.tipoSospechoso.tipoDetectado}`,
      );
    }
    if (res.formatoFechaIndicado)
      console.log(`  Formato indicado: ${res.formatoFechaIndicado}`);
  }

  const cambios = cambiosPorAnalisis(r);
  titulo('Estado que se guardaría');
  console.log(
    `  extraccionEstado: ${cambios.extraccionEstado}` +
      (cambios.extraccionError ? ` — ${cambios.extraccionError}` : ''),
  );
}

main().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
