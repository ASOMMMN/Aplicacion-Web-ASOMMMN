/**
 * Extracción de fechas de documentos personales con IA (OpenAI).
 *
 * Función independiente de Nest para poder usarla desde el servicio (subida
 * y POST /docs-personales/extraer-ia) y desde scripts (backfill) sin levantar
 * la aplicación. No escribe en BD ni en auditoría: eso lo hace quien llama.
 */
import OpenAI from 'openai';
import {
  ConfiguracionLectura,
  DocumentoLeido,
  leerDocumento,
  ModoLectura,
} from './lectura-documento';

import type { TipoDocPersonal } from '../constants/tipos-doc-personal';
import {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  construirPromptPdfEscaneado,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from './prompts-doc-personal';
import {
  TipoSospechoso,
  validarFechasDocPersonal,
} from './validar-fechas-doc-personal';

export {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  construirPromptPdfEscaneado,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from './prompts-doc-personal';

/** Formatos que la extracción IA sabe leer. */
export const MIMES_EXTRACCION_IA = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export type Confianza = 'alta' | 'media' | 'baja';

/** "anio": el documento solo da el año (INE); la fecha es 31/12 de ese año. */
export type PrecisionFecha = 'dia' | 'anio';

export type CampoFecha = 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento';
export const CAMPOS_FECHA: CampoFecha[] = [
  'fechaEmision',
  'fechaInicio',
  'fechaVencimiento',
];

/** Una fecha tal como la reportó el modelo (con su evidencia). */
export interface FechaDetectada {
  valor: string | null;
  /** Fragmento literal del documento donde aparece la fecha. */
  textoLiteral: string | null;
  /** Etiqueta que acompaña a la fecha ("Date of expiry", "VIGENCIA"…). */
  etiqueta: string | null;
  confianza: Confianza;
  precision: PrecisionFecha;
}

/**
 * Respuesta de la extracción IA de documentos personales.
 * Los campos planos (fechaInicio, confianza…) se conservan por
 * compatibilidad con POST /docs-personales/extraer-ia.
 */
export interface ExtraerDocPersonalIaResponse {
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  fechaEmision: string | null;
  confianza: Record<CampoFecha, Confianza>;
  /** Evidencia por fecha: texto literal, etiqueta, confianza y precisión. */
  detalle?: Record<CampoFecha, FechaDetectada>;
  /** Tipo que el modelo reconoce en el contenido (puede diferir del elegido). */
  tipoDetectado?: string | null;
  /** Formato declarado en el documento ("dd/mm/aaaa"…), si lo hay. */
  formatoFechaIndicado?: string | null;
  /** Validación en código (validar-fechas-doc-personal.ts). */
  revisar?: boolean;
  motivosRevision?: string[];
  tipoSospechoso?: TipoSospechoso | null;
  /** Fechas propuestas por el modelo que la validación descartó (motivos). */
  fechasDescartadas?: string[];
  iaDisponible: boolean;
  errorMensaje?: string;
}

// ── Normalización de la respuesta ──────────────────────────────────────────

/** YYYY-MM-DD de calendario válido; cualquier otra cosa → null. */
export function normalizarFechaIa(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const fecha = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? fecha
    : null;
}

export function normalizarConfianza(value: unknown): Confianza {
  return value === 'alta' || value === 'media' || value === 'baja'
    ? value
    : 'baja';
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null;

/**
 * Acepta el formato nuevo ({ valor, textoLiteral, etiqueta, confianza,
 * precision }) y el anterior (fecha como string + confianza aparte).
 */
export function normalizarFechaDetectada(
  crudo: unknown,
  confianzaPlana?: unknown,
): FechaDetectada {
  if (crudo && typeof crudo === 'object') {
    const o = crudo as Record<string, unknown>;
    const valor = normalizarFechaIa(o.valor);
    return {
      valor,
      textoLiteral: texto(o.textoLiteral),
      etiqueta: texto(o.etiqueta),
      confianza: valor ? normalizarConfianza(o.confianza) : 'baja',
      precision: o.precision === 'anio' ? 'anio' : 'dia',
    };
  }
  const valor = normalizarFechaIa(crudo);
  return {
    valor,
    textoLiteral: typeof crudo === 'string' ? texto(crudo) : null,
    etiqueta: null,
    confianza: valor ? normalizarConfianza(confianzaPlana) : 'baja',
    precision: 'dia',
  };
}

type RespuestaModelo = Record<string, unknown> & {
  confianza?: Record<string, unknown>;
};

export const sinFechas = (
  iaDisponible: boolean,
  errorMensaje: string,
): ExtraerDocPersonalIaResponse => ({
  fechaInicio: null,
  fechaVencimiento: null,
  fechaEmision: null,
  confianza: {
    fechaInicio: 'baja',
    fechaVencimiento: 'baja',
    fechaEmision: 'baja',
  },
  iaDisponible,
  errorMensaje,
  revisar: false,
  motivosRevision: [],
  tipoSospechoso: null,
  fechasDescartadas: [],
});

/** Arma la respuesta plana a partir del detalle por fecha. */
export function respuestaDesdeDetalle(
  detalle: Record<CampoFecha, FechaDetectada>,
  extra: Pick<
    ExtraerDocPersonalIaResponse,
    'tipoDetectado' | 'formatoFechaIndicado'
  > = {},
): ExtraerDocPersonalIaResponse {
  return {
    fechaEmision: detalle.fechaEmision.valor,
    fechaInicio: detalle.fechaInicio.valor,
    fechaVencimiento: detalle.fechaVencimiento.valor,
    confianza: {
      fechaEmision: detalle.fechaEmision.confianza,
      fechaInicio: detalle.fechaInicio.confianza,
      fechaVencimiento: detalle.fechaVencimiento.confianza,
    },
    detalle,
    ...extra,
    iaDisponible: true,
  };
}

export function normalizarRespuesta(
  parsed: RespuestaModelo,
): ExtraerDocPersonalIaResponse {
  const detalle = Object.fromEntries(
    CAMPOS_FECHA.map((c) => [
      c,
      normalizarFechaDetectada(parsed[c], parsed.confianza?.[c]),
    ]),
  ) as Record<CampoFecha, FechaDetectada>;
  return respuestaDesdeDetalle(detalle, {
    tipoDetectado: texto(parsed.tipoDetectado),
    formatoFechaIndicado: texto(parsed.formatoFechaIndicado),
  });
}

/** Quita el cerco de markdown que a veces agrega el modelo alrededor del JSON. */
function quitarCercoJson(texto: string): string {
  return texto
    .replace(/^`{3}json\s*/i, '')
    .replace(/\s*`{3}$/i, '')
    .trim();
}

// ── Extracción ─────────────────────────────────────────────────────────────

/** Cómo se leyó el archivo (útil para auditoría y estimación de costo). */
export type OrigenExtraccion = ModoLectura;

export interface ResultadoExtraccionFechas {
  resultado: ExtraerDocPersonalIaResponse;
  /** undefined si no se llegó a llamar al modelo. */
  origen?: OrigenExtraccion;
  modelo: string;
  paginasTotales?: number;
  paginasLeidas?: number;
  /** Respuesta cruda del modelo (para auditoría y diagnóstico). */
  respuestaCruda?: string;
  /** Aviso no fatal de la lectura (p. ej. no se pudo renderizar). */
  aviso?: string;
}

export interface OpcionesExtraccionFechas {
  buffer: Buffer;
  mimeType: string;
  tipo: TipoDocPersonal;
  apiKey: string;
  modelo: string;
  /** Cliente reutilizable; si no se pasa, se crea uno con apiKey. */
  openai?: OpenAI;
  /** Umbral de texto, páginas y resolución (por defecto, CONFIG_LECTURA_POR_DEFECTO). */
  lectura?: ConfiguracionLectura;
  /** Para registrar errores (por defecto, console.error). */
  onError?: (mensaje: string) => void;
}

/** Envía texto y/o imágenes de páginas al modelo de visión. */
async function llamarVision(
  openai: OpenAI,
  modelo: string,
  tipo: TipoDocPersonal,
  doc: DocumentoLeido,
): Promise<string> {
  const nota =
    doc.imagenes.length === 0
      ? ''
      : doc.texto
        ? '\n\nSe adjunta además la imagen de la primera página: úsala para confirmar qué etiqueta acompaña a cada fecha.'
        : `\n\nSe adjuntan ${doc.imagenes.length} página(s) del documento como imágenes: revísalas todas.`;
  const prompt = doc.texto
    ? construirPromptDocPersonal(doc.texto, tipo)
    : construirPromptImagenDocPersonal(tipo);

  const completion = await openai.chat.completions.create({
    model: modelo,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_DOC_PERSONAL },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${prompt}${nota}` },
          ...doc.imagenes.map((url) => ({
            type: 'image_url' as const,
            image_url: { url, detail: 'high' as const },
          })),
        ],
      },
    ],
    temperature: 0,
    max_tokens: 800,
  });
  return completion.choices[0]?.message?.content ?? '{}';
}

/** Respaldo cuando no se pudo renderizar: el PDF completo a la Responses API. */
async function llamarResponsesConPdf(
  apiKey: string,
  modelo: string,
  tipo: TipoDocPersonal,
  buffer: Buffer,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
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
              file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
            },
            {
              type: 'input_text',
              text: `${SYSTEM_PROMPT_DOC_PERSONAL}\n${construirPromptPdfEscaneado(tipo)}`,
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`OpenAI Responses API: ${await response.text()}`),
      { status: response.status },
    );
  }

  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return quitarCercoJson(
    json.output_text ??
      json.output
        ?.flatMap((item) => item.content ?? [])
        .map((item) => item.text ?? '')
        .filter(Boolean)
        .join('\n') ??
      '{}',
  );
}

/**
 * Analiza un documento personal y devuelve solo las fechas que aparecen
 * explícitamente. Nunca lanza: los errores vuelven en `errorMensaje`.
 */
export async function extraerFechasDocPersonal(
  opciones: OpcionesExtraccionFechas,
): Promise<ResultadoExtraccionFechas> {
  const { buffer, mimeType, tipo, apiKey, modelo } = opciones;
  const onError = opciones.onError ?? ((m: string) => console.error(m));

  if (!apiKey?.trim()) {
    const msg =
      'Falta la API key de OpenAI: OPENAI_API_KEY no está configurada en el servidor.';
    onError(`extraerFechasDocPersonal (${tipo}): ${msg}`);
    return { resultado: sinFechas(false, msg), modelo };
  }
  if (!buffer || buffer.length === 0) {
    return { resultado: sinFechas(false, 'El archivo está vacío.'), modelo };
  }
  if (!MIMES_EXTRACCION_IA.includes(mimeType)) {
    return {
      resultado: sinFechas(
        true,
        'Tipo de archivo no compatible con la extracción IA.',
      ),
      modelo,
    };
  }

  const openai = opciones.openai ?? new OpenAI({ apiKey });

  let doc: DocumentoLeido;
  try {
    doc = await leerDocumento(buffer, mimeType, opciones.lectura);
  } catch (err) {
    const msg = `${mimeType === 'application/pdf' ? 'PDF ilegible' : 'Imagen ilegible'}: ${(err as Error).message}`;
    onError(msg);
    return { resultado: sinFechas(true, msg), modelo };
  }
  if (doc.aviso) onError(doc.aviso);

  const meta = {
    origen: doc.modo,
    modelo,
    paginasTotales: doc.paginasTotales,
    paginasLeidas: doc.paginasLeidas,
    aviso: doc.aviso,
  };

  let raw: string;
  try {
    raw =
      doc.modo === 'pdf-crudo'
        ? await llamarResponsesConPdf(apiKey, modelo, tipo, buffer)
        : await llamarVision(openai, modelo, tipo, doc);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    const status =
      (err as { status?: number })?.status ??
      (err as { statusCode?: number })?.statusCode ??
      0;
    onError(`extraerFechasDocPersonal falló — HTTP ${status} — ${msg}`);
    return {
      ...meta,
      resultado: sinFechas(
        true,
        status === 401
          ? 'Error de OpenAI: API key inválida o revocada (HTTP 401).'
          : status === 429
            ? 'Error de OpenAI: sin crédito o cuota agotada (HTTP 429).'
            : `Error de OpenAI${status ? ` (HTTP ${status})` : ''}: ${msg.slice(0, 300)}`,
      ),
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(quitarCercoJson(raw)) as Record<string, unknown>;
  } catch {
    onError(
      `La IA devolvió JSON inválido (${doc.modo}) para documento ${tipo}.`,
    );
    return {
      ...meta,
      respuestaCruda: raw,
      resultado: sinFechas(
        true,
        'Error de OpenAI: la respuesta no pudo interpretarse como JSON.',
      ),
    };
  }

  // El modelo propone; el código verifica (día/mes, INE, orden, duración, tipo).
  return {
    ...meta,
    respuestaCruda: raw,
    resultado: validarFechasDocPersonal(tipo, normalizarRespuesta(parsed)),
  };
}
