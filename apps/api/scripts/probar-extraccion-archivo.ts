/**
 * Prueba la extracción de fechas con un archivo local (PDF, JPG o PNG),
 * con la MISMA función que usa el servidor (lectura + prompts por tipo +
 * validación en código). No se conecta a la base ni escribe nada.
 *
 * Imprime: cuánto texto se extrajo, si se usó visión (imágenes de páginas),
 * la respuesta cruda del modelo, lo que propuso el modelo, las lecturas
 * deterministas por fuente (QR, cadena original, etiquetas) y por documento,
 * el documento principal elegido, el estado de cada fecha (fuente,
 * Coincidente, Revisar), el resultado final y el estado que se guardaría.
 *
 * Variables de entorno (del proceso o, si faltan, de apps/api/.env; de ese
 * archivo solo se leen estas): OPENAI_API_KEY, OPENAI_MODEL_DOCS,
 * IA_DOCS_UMBRAL_TEXTO, IA_DOCS_MAX_PAGINAS, IA_DOCS_ANCHO_PX,
 * IA_DOCS_MAX_CARACTERES_TEXTO, IA_DOCS_MAX_PARTES, IA_DOCS_QR_MAX_PAGINAS.
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
  modeloDocsDesdeEnv,
  seedDesdeEnv,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import {
  configLecturaDesdeEnv,
  leerDocumento,
} from '../src/modules/docs-personales/ia/lectura-documento';
import { cambiosPorAnalisis } from '../src/modules/docs-personales/ia/cambios-analisis';
import type { LecturaFecha } from '../src/modules/docs-personales/ia/extractor-etiquetas';
import { formatearConPrecision } from '../src/modules/docs-personales/ia/formatos-fecha';
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
    'OPENAI_MODEL_DOCS',
    'IA_DOCS_UMBRAL_TEXTO',
    'IA_DOCS_MAX_PAGINAS',
    'IA_DOCS_ANCHO_PX',
    'IA_DOCS_MAX_CARACTERES_TEXTO',
    'IA_DOCS_MAX_PARTES',
    'IA_DOCS_QR_MAX_PAGINAS',
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

const CAMPOS = ['fechaEmision', 'fechaInicio', 'fechaVencimiento'] as const;
const fmt = (valor: string | null | undefined, precision?: string) =>
  valor
    ? (formatearConPrecision(valor, (precision ?? 'dia') as 'dia') ?? valor)
    : '—';

/** Lecturas deterministas agrupadas por fuente, página y grupo local. */
function imprimirLecturas(lecturas: LecturaFecha[]) {
  if (lecturas.length === 0) {
    console.log(
      '  (ninguna: sin QR, sin cadena original y sin etiquetas en el texto)',
    );
    return;
  }
  for (const fuente of ['qr', 'texto', 'ocr'] as const) {
    const ls = lecturas.filter((l) => l.fuente === fuente);
    if (ls.length === 0) continue;
    console.log(`  [${fuente}]`);
    for (const l of ls) {
      console.log(
        `    pág. ${l.pagina} grupo ${l.grupo}  ${l.campo.padEnd(17)} ${fmt(l.valor, l.precision).padEnd(11)} clave ${l.clave.padEnd(10)} "${l.etiqueta}" → "${l.textoLiteral}"`,
      );
    }
  }
}

function imprimirCombinacion(res: ExtraerDocPersonalIaResponse) {
  titulo('Documentos detectados');
  const grupos = res.grupos ?? [];
  if (grupos.length === 0) {
    console.log('  (sin lecturas deterministas: se usa solo la IA)');
  }
  for (const g of grupos) {
    const fechas = CAMPOS.filter((c) => g.fechas[c])
      .map(
        (c) =>
          `${c} ${fmt(g.fechas[c]!.valor, g.fechas[c]!.precision)} [${g.fechas[c]!.fuente}]`,
      )
      .join(' · ');
    console.log(
      `  ${g.principal ? '★' : ' '} Documento ${g.indice + 1} (pág. ${g.paginas.join(', ')}): ${fechas || 'sin fechas'}`,
    );
  }
  if (grupos.length > 0) {
    console.log(
      `  Principal: documento ${(res.principal ?? 0) + 1} (vencimiento más reciente)`,
    );
  }

  titulo('Estado por fecha');
  for (const c of CAMPOS) {
    const f = res.fuentes?.[c];
    const conf = res.confianza[c];
    const estado = !f?.valor
      ? '—'
      : conf === 'baja'
        ? 'Revisar'
        : f.coincidente
          ? 'Coincidente'
          : 'sin confirmar';
    console.log(
      `  ${c.padEnd(17)} ${fmt(f?.valor, f?.precision).padEnd(11)} fuente ${String(f?.fuente ?? '—').padEnd(6)} ${estado.padEnd(13)} confianza ${conf}`,
    );
    for (const l of f?.lecturas ?? []) {
      console.log(
        `      ${l.fuente.padEnd(6)} ${l.clave}${l.pagina ? ` (pág. ${l.pagina})` : ''}`,
      );
    }
  }

  if (res.evidenciaEstructurada?.length) {
    titulo('QR y cadena original (evidencia)');
    for (const e of res.evidenciaEstructurada) {
      console.log(`  pág. ${e.pagina} ${e.origen}: ${e.texto.slice(0, 300)}`);
    }
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
    modeloDocsDesdeEnv((k) => env[k]);
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
    seed: seedDesdeEnv((k) => env[k]),
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
    if (r.tiempos) {
      const pags = Math.max(1, r.paginasLeidas ?? 1);
      console.log(
        `  Tiempo: lectura ${r.tiempos.lecturaMs} ms (${Math.round(r.tiempos.lecturaMs / pags)} ms/página)` +
          (r.tiempos.modeloMs !== undefined
            ? ` · modelo ${r.tiempos.modeloMs} ms`
            : ''),
      );
    }
  } else {
    console.log('  No se llegó a llamar al modelo.');
  }

  if (r.resultado.lecturasIa?.length) {
    titulo('Lecturas de la IA (doble lectura y consenso)');
    for (const l of r.resultado.lecturasIa) {
      const fechas = (
        ['fechaEmision', 'fechaInicio', 'fechaVencimiento'] as const
      )
        .map(
          (c) =>
            `${c.replace('fecha', '')}: ${l.fechas[c].valor ?? '—'} (${l.fechas[c].confianza})`,
        )
        .join(' · ');
      console.log(
        `  ${l.id} [${l.variante}] tipo ${l.tipoDetectado ?? '—'} (${l.confianzaTipo ?? '—'}) · ${fechas}`,
      );
    }
    if (r.resultado.consenso) {
      for (const [c, k] of Object.entries(r.resultado.consenso)) {
        console.log(`  Consenso ${c}: ${k.estado}, se usó ${k.elegida}`);
      }
    }
    if (r.resultado.reextraccion) {
      console.log(
        `  Reextraído como ${r.resultado.reextraccion.tipoUsado} (elegido: ${r.resultado.reextraccion.tipoElegido})`,
      );
    }
  }

  titulo('Respuesta cruda del modelo');
  console.log(r.respuestaCruda ?? '  (ninguna)');

  if (r.propuestaModelo) {
    titulo('Propuesta del modelo (antes de validar)');
    imprimirFechas(r.propuestaModelo);
  }

  titulo('Lecturas deterministas (por fuente)');
  imprimirLecturas(r.lecturasDeterministas ?? []);

  const res = r.resultado;
  if (!res.errorMensaje) imprimirCombinacion(res);

  titulo('Resultado final (combinado y validado)');
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

  if (r.tokens) {
    titulo('Tokens');
    console.log(
      `  Estimados antes de enviar: ~${r.tokens.estimadoEntrada} de entrada` +
        (r.tokens.entrada !== undefined
          ? ` · reales: ${r.tokens.entrada} de entrada, ${r.tokens.salida ?? 0} de salida`
          : '') +
        (r.tokens.reintentos429
          ? ` · ${r.tokens.reintentos429} espera(s) por límite por minuto`
          : ''),
    );
  }
  if (r.errorOpenAI) {
    console.log(
      `  Error de OpenAI: ${r.errorOpenAI.tipo} (${r.errorOpenAI.codigo ?? 'sin code'}, HTTP ${r.errorOpenAI.status})`,
    );
  }

  const cambios = cambiosPorAnalisis(r);
  titulo('Estado que se guardaría');
  console.log(
    cambios
      ? `  extraccionEstado: ${cambios.extraccionEstado}` +
          (cambios.extraccionError ? ` — ${cambios.extraccionError}` : '')
      : '  (nada: límite por minuto de OpenAI, el documento queda como estaba)',
  );
}

main().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
