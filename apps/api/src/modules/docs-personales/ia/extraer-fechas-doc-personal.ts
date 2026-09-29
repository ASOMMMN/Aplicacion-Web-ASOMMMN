/**
 * Extracción de fechas de documentos personales con IA (OpenAI).
 *
 * Función independiente de Nest para poder usarla desde el servicio (subida
 * y POST /docs-personales/extraer-ia) y desde scripts (backfill) sin levantar
 * la aplicación. No escribe en BD ni en auditoría: eso lo hace quien llama.
 */
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

import type { TipoDocPersonal } from '../constants/tipos-doc-personal';

/** Formatos que la extracción IA sabe leer. */
export const MIMES_EXTRACCION_IA = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

/** Caracteres mínimos de texto para tratar un PDF como "con texto". */
export const MIN_CARACTERES_PDF_TEXTO = 20;

/** Máximo de texto del PDF que se envía al modelo. */
export const MAX_CARACTERES_PDF_TEXTO = 8000;

/**
 * Respuesta de la extracción IA de documentos personales.
 */
export interface ExtraerDocPersonalIaResponse {
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  fechaEmision: string | null;
  confianza: {
    fechaInicio: 'alta' | 'media' | 'baja';
    fechaVencimiento: 'alta' | 'media' | 'baja';
    fechaEmision: 'alta' | 'media' | 'baja';
  };
  iaDisponible: boolean;
  errorMensaje?: string;
}

/**
 * Prompt base para documentos personales.
 */
export const SYSTEM_PROMPT_DOC_PERSONAL = `
Eres un extractor experto de información de documentos oficiales
utilizados en procesos de evaluación curricular de personal marítimo.

Tu tarea es EXTRAER INFORMACIÓN ÚNICAMENTE DEL CONTENIDO DEL DOCUMENTO.

REGLAS OBLIGATORIAS:

1. Nunca utilices el nombre del archivo como fuente de información.
2. Nunca inventes fechas.
3. Nunca calcules una fecha de vencimiento.
4. Nunca asumas que un documento tiene una vigencia determinada.
5. Si una fecha no aparece explícitamente en el documento, devuelve null.
6. Respeta exactamente las fechas que aparecen en el documento.
7. Convierte las fechas al formato YYYY-MM-DD.
8. Si una fecha es ambigua o no puede determinarse con seguridad, devuelve null.
9. Diferencia entre fecha de emisión y fecha de inicio de vigencia.
10. Si la fecha de emisión también representa el inicio de vigencia, puedes devolverla
    en ambos campos únicamente cuando el documento indique explícitamente que ambas
    fechas corresponden al mismo momento.
11. No confundas fechas de nacimiento, fechas de captura, fechas de impresión,
    fechas de renovación o fechas de modificación con fechas de vigencia.
12. Devuelve ÚNICAMENTE JSON válido.
13. No incluyas markdown.
14. No incluyas explicaciones fuera del JSON.
`;

/** Reglas adicionales según el tipo de documento. */
const construirReglasPorTipo = (tipoDocumento: string): string => {
  switch (tipoDocumento) {
    case 'INE':
      return `
DOCUMENTO INE:
- Busca principalmente la fecha de vigencia que aparece en la credencial.
- Si aparece una fecha de emisión o expedición explícita, extráela como fechaEmision.
- NO confundas la fecha de nacimiento con la fecha de emisión.
- NO uses el año o número de vigencia para inventar una fecha.
- Si solo aparece una vigencia expresada de forma no convertible con seguridad, devuelve null.
`;

    case 'visa':
      return `
DOCUMENTO VISA:
- Busca Date of Issue / Issued / Fecha de expedición como fechaEmision.
- Busca Expiration Date / Expires / Fecha de vencimiento como fechaVencimiento.
- No confundas la fecha de nacimiento con la fecha de emisión.
- Si la visa muestra una fecha de inicio y otra de vencimiento, usa ambas explícitamente.
`;

    case 'pasaporte':
      return `
DOCUMENTO PASAPORTE:
- Busca Date of Issue / Date of Expiry / Fecha de expedición / Fecha de vencimiento.
- La fecha de nacimiento NO es fechaEmision.
- La fecha de expiración debe salir literalmente del documento.
`;

    case 'libreta_identidad_maritima':
      return `
LIBRETA DE IDENTIDAD MARÍTIMA:
- Revisa portada, página de datos y páginas donde aparezcan fechas de expedición, vigencia o expiración.
- Busca expresiones como Fecha de expedición, Fecha de emisión, Válida hasta, Fecha de vencimiento,
  Date of Issue, Date of Expiry, Valid Until.
- No confundas fecha de nacimiento, fecha de firma, fecha de impresión o fecha de renovación.
- Si hay inicio y fin de vigencia explícitos, extrae ambos.
`;

    case 'constancia_participacion':
      return `
CONSTANCIA DE PARTICIPACIÓN:
- Busca la fecha en que fue emitida o expedida la constancia.
- Si el documento indica explícitamente periodo, inicio o término de participación, extráelos.
- No conviertas automáticamente la fecha del evento en fecha de emisión.
- No inventes vigencia si la constancia no la establece.
`;

    case 'certificado_medico':
      return `
CERTIFICADO MÉDICO:
- Busca fecha de expedición/emisión del certificado.
- Busca expresiones de vigencia como Válido hasta, Vigente hasta, Expira, Expiration Date.
- Si indica explícitamente inicio de vigencia, extráelo.
- No calcules una vigencia médica a partir de la fecha de emisión.
`;

    default:
      return `
DOCUMENTO NO ESPECIALIZADO:
- Extrae únicamente las fechas acompañadas de etiquetas que permitan determinar su significado.
`;
  }
};

/**
 * Construye el prompt específico para cada documento.
 */
export const construirPromptDocPersonal = (
  texto: string,
  tipoDocumento: string,
): string => `
Analiza el siguiente documento personal.

TIPO DE DOCUMENTO:
${tipoDocumento}

REGLAS ESPECÍFICAS DEL DOCUMENTO:
${construirReglasPorTipo(tipoDocumento)}

DOCUMENTO:
--- INICIO ---
${texto}
--- FIN ---

Extrae exactamente estos campos:

1. fechaEmision

Representa la fecha en que el documento fue emitido, expedido,
expedido por la autoridad o generado oficialmente.

Busca expresiones como:

- Fecha de emisión
- Fecha de expedición
- Fecha de expedición:
- Fecha de expedición del documento
- Date of issue
- Issue date
- Issued
- Issued on
- Date issued
- Expedido el
- Expedición

NO confundas esta fecha con:
- fecha de nacimiento
- fecha de impresión
- fecha de captura
- fecha de renovación
- fecha de vencimiento

Si no existe explícitamente, devuelve null.

2. fechaInicio

Representa el inicio EXPLÍCITO de la vigencia del documento.

Busca expresiones como:

- Fecha de inicio
- Inicio de vigencia
- Vigente desde
- Válido desde
- Validez desde
- Fecha inicial
- Start date
- Valid from
- Effective date
- Effective from
- Validity from

IMPORTANTE:
Si únicamente existe una fecha de emisión pero el documento NO indica
que esa fecha sea el inicio de vigencia, NO la copies automáticamente
a fechaInicio.

Si no existe explícitamente, devuelve null.

3. fechaVencimiento

Representa la fecha EXPLÍCITA en que termina la vigencia del documento.

Busca expresiones como:

- Fecha de vencimiento
- Fecha de expiración
- Válido hasta
- Vigente hasta
- Expira
- Expiración
- Expiry date
- Expiration date
- Valid until
- Valid through
- Date of expiry
- Date of expiration

Si no existe explícitamente, devuelve null.

NO calcules fechas de vencimiento.

Ejemplos:

Si aparece:
"Fecha de expedición: 15/03/2024"
y
"Fecha de vencimiento: 15/03/2034"

devuelve:

{
  "fechaEmision": "2024-03-15",
  "fechaInicio": null,
  "fechaVencimiento": "2034-03-15"
}

Si aparece:

"Válido desde: 01/01/2026"
"Válido hasta: 31/12/2026"

devuelve:

{
  "fechaEmision": null,
  "fechaInicio": "2026-01-01",
  "fechaVencimiento": "2026-12-31"
}

Si aparece:

"Fecha de emisión: 10/06/2023"
"Vigente desde: 10/06/2023"
"Válido hasta: 10/06/2033"

devuelve:

{
  "fechaEmision": "2023-06-10",
  "fechaInicio": "2023-06-10",
  "fechaVencimiento": "2033-06-10"
}

La respuesta DEBE tener exactamente esta estructura:

{
  "fechaInicio": "YYYY-MM-DD o null",
  "fechaVencimiento": "YYYY-MM-DD o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "confianza": {
    "fechaInicio": "alta|media|baja",
    "fechaVencimiento": "alta|media|baja",
    "fechaEmision": "alta|media|baja"
  }
}
`;

/**
 * Prompt utilizado cuando el archivo es una imagen.
 */
export const construirPromptImagenDocPersonal = (
  tipoDocumento: string,
): string => `
Analiza visualmente la imagen del siguiente documento personal.

TIPO DE DOCUMENTO:
${tipoDocumento}

REGLAS ESPECÍFICAS DEL DOCUMENTO:
${construirReglasPorTipo(tipoDocumento)}

Tu tarea es identificar ÚNICAMENTE fechas que aparezcan
visualmente de forma explícita en el documento.

Reglas:

1. Nunca inventes fechas.
2. Nunca calcules una fecha de vencimiento.
3. Si una fecha no aparece claramente, devuelve null.
4. No confundas fecha de nacimiento con fecha de emisión.
5. No confundas fecha de impresión con fecha de emisión.
6. No confundas fecha de renovación con fecha de vencimiento.
7. Identifica la etiqueta que acompaña a cada fecha.
8. Convierte todas las fechas válidas a YYYY-MM-DD.
9. Si la fecha es ilegible o ambigua, devuelve null.
10. Devuelve únicamente JSON válido.
11. No uses markdown.
12. No agregues explicaciones.

Busca especialmente:

FECHA DE EMISIÓN:
- Fecha de emisión
- Fecha de expedición
- Date of issue
- Issue date
- Issued on
- Issued

FECHA DE INICIO:
- Fecha de inicio
- Inicio de vigencia
- Vigente desde
- Válido desde
- Valid from
- Effective from
- Start date

FECHA DE VENCIMIENTO:
- Fecha de vencimiento
- Fecha de expiración
- Válido hasta
- Vigente hasta
- Expira
- Expiry date
- Expiration date
- Valid until
- Valid through

Devuelve exactamente:

{
  "fechaInicio": "YYYY-MM-DD o null",
  "fechaVencimiento": "YYYY-MM-DD o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "confianza": {
    "fechaInicio": "alta|media|baja",
    "fechaVencimiento": "alta|media|baja",
    "fechaEmision": "alta|media|baja"
  }
}
`;

/** Prompt para PDF escaneado (sin texto extraíble): se envía el PDF completo. */
export const construirPromptPdfEscaneado = (tipoDocumento: string): string => `
Analiza visualmente el PDF completo del documento personal.

TIPO DE DOCUMENTO:
${tipoDocumento}

REGLAS ESPECÍFICAS:
${construirReglasPorTipo(tipoDocumento)}

${construirPromptDocPersonal('', tipoDocumento)}

IMPORTANTE PARA PDF ESCANEADO:
- Lee visualmente todas las páginas necesarias del PDF.
- No dependas únicamente de texto extraído por software.
- Identifica las etiquetas junto a las fechas.
- Si una fecha no puede leerse con seguridad, devuelve null.
`;

// ── Normalización de la respuesta ──────────────────────────────────────────

type Confianza = 'alta' | 'media' | 'baja';

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

interface RespuestaModelo {
  fechaInicio?: unknown;
  fechaVencimiento?: unknown;
  fechaEmision?: unknown;
  confianza?: {
    fechaInicio?: unknown;
    fechaVencimiento?: unknown;
    fechaEmision?: unknown;
  };
}

const sinFechas = (
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
});

function normalizarRespuesta(
  parsed: RespuestaModelo,
): ExtraerDocPersonalIaResponse {
  return {
    fechaInicio: normalizarFechaIa(parsed.fechaInicio),
    fechaVencimiento: normalizarFechaIa(parsed.fechaVencimiento),
    fechaEmision: normalizarFechaIa(parsed.fechaEmision),
    confianza: {
      fechaInicio: normalizarConfianza(parsed.confianza?.fechaInicio),
      fechaVencimiento: normalizarConfianza(parsed.confianza?.fechaVencimiento),
      fechaEmision: normalizarConfianza(parsed.confianza?.fechaEmision),
    },
    iaDisponible: true,
  };
}

/** Quita el cerco de markdown que a veces agrega el modelo alrededor del JSON. */
function quitarCercoJson(texto: string): string {
  return texto
    .replace(/^`{3}json\s*/i, '')
    .replace(/\s*`{3}$/i, '')
    .trim();
}

// ── Extracción ─────────────────────────────────────────────────────────────

/** Cómo se analizó el archivo (útil para auditoría y estimación de costo). */
export type OrigenExtraccion = 'pdf-texto' | 'pdf-visual' | 'imagen';

export interface ResultadoExtraccionFechas {
  resultado: ExtraerDocPersonalIaResponse;
  /** undefined si no se llegó a llamar al modelo. */
  origen?: OrigenExtraccion;
  modelo: string;
}

export interface OpcionesExtraccionFechas {
  buffer: Buffer;
  mimeType: string;
  tipo: TipoDocPersonal;
  apiKey: string;
  modelo: string;
  /** Cliente reutilizable; si no se pasa, se crea uno con apiKey. */
  openai?: OpenAI;
  /** Para registrar errores (por defecto, console.error). */
  onError?: (mensaje: string) => void;
}

/** Texto de un PDF (vacío si es escaneado). */
export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const r = await parser.getText();
    return r.text?.trim() ?? '';
  } finally {
    await parser.destroy();
  }
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

  if (!apiKey) {
    return {
      resultado: sinFechas(
        false,
        'IA no disponible (OPENAI_API_KEY no configurada).',
      ),
      modelo,
    };
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

  try {
    let origen: OrigenExtraccion;
    let raw: string;

    if (mimeType === 'application/pdf') {
      const textoPdf = await extraerTextoPdf(buffer);

      if (textoPdf.length < MIN_CARACTERES_PDF_TEXTO) {
        // PDF escaneado: se envía el PDF completo a la Responses API para que
        // el modelo lo lea visualmente (pdf-parse no extrae texto de imágenes).
        origen = 'pdf-visual';
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
        raw = quitarCercoJson(
          json.output_text ??
            json.output
              ?.flatMap((item) => item.content ?? [])
              .map((item) => item.text ?? '')
              .filter(Boolean)
              .join('\n') ??
            '{}',
        );
      } else {
        origen = 'pdf-texto';
        const completion = await openai.chat.completions.create({
          model: modelo,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_DOC_PERSONAL },
            {
              role: 'user',
              content: construirPromptDocPersonal(
                textoPdf.slice(0, MAX_CARACTERES_PDF_TEXTO),
                tipo,
              ),
            },
          ],
          temperature: 0,
          max_tokens: 500,
        });
        raw = completion.choices[0]?.message?.content ?? '{}';
      }
    } else {
      origen = 'imagen';
      const completion = await openai.chat.completions.create({
        model: modelo,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_DOC_PERSONAL },
          {
            role: 'user',
            content: [
              { type: 'text', text: construirPromptImagenDocPersonal(tipo) },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${buffer.toString('base64')}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 500,
      });
      raw = completion.choices[0]?.message?.content ?? '{}';
    }

    let parsed: RespuestaModelo;
    try {
      parsed = JSON.parse(raw) as RespuestaModelo;
    } catch {
      onError(
        `La IA devolvió JSON inválido (${origen}) para documento ${tipo}.`,
      );
      return {
        resultado: sinFechas(
          true,
          origen === 'pdf-visual'
            ? 'La IA pudo abrir el PDF, pero no devolvió una respuesta interpretable.'
            : 'La IA devolvió una respuesta que no pudo interpretarse.',
        ),
        origen,
        modelo,
      };
    }

    return { resultado: normalizarRespuesta(parsed), origen, modelo };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    const status =
      (err as { status?: number })?.status ??
      (err as { statusCode?: number })?.statusCode ??
      0;
    onError(`extraerFechasDocPersonal falló — HTTP ${status} — ${msg}`);
    return {
      resultado: sinFechas(
        true,
        status === 401
          ? 'API key de OpenAI inválida o revocada. Contacta al administrador.'
          : status === 429
            ? 'Sin crédito o cuota de OpenAI agotada. Contacta al administrador.'
            : `No se pudo analizar el documento con IA: ${msg}`,
      ),
      modelo,
    };
  }
}
