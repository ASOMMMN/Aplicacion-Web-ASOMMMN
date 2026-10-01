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
import type { ImagenPreparada } from './preparar-imagen';
import {
  clasificarErrorOpenAI,
  CONFIG_REINTENTOS_POR_DEFECTO,
  ConfigReintentos,
  conReintentosOpenAI,
  TipoErrorOpenAI,
  tokensImagen,
  tokensTexto,
} from '../../../common/utils/openai-errores.util';

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
import { combinarFuentes, FuenteCampo, GrupoFechas } from './combinar-fuentes';
import { extraerPorEtiquetas, LecturaFecha } from './extractor-etiquetas';

export {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  construirPromptPdfEscaneado,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from './prompts-doc-personal';

/**
 * Modelo para leer documentos: OPENAI_MODEL_DOCS, por defecto gpt-4o.
 * Medido con documentos reales: gpt-4o-mini cobra ~33× más tokens por
 * imagen (114 000–198 000 tokens de entrada por documento contra 4 400–7 900
 * con gpt-4o), agota el límite por minuto y leyó peor los escaneos.
 * OPENAI_MODEL se sigue usando para chatbot, CV y cursos.
 */
export const MODELO_DOCS_POR_DEFECTO = 'gpt-4o';
export const modeloDocsDesdeEnv = (
  leer: (clave: string) => string | undefined,
): string => leer('OPENAI_MODEL_DOCS')?.trim() || MODELO_DOCS_POR_DEFECTO;

/** Formatos que la extracción IA sabe leer. */
export const MIMES_EXTRACCION_IA = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export type Confianza = 'alta' | 'media' | 'baja';

/**
 * Precisión de una fecha, determinada por su texto literal: "dia", "mes"
 * (04/2025) o "anio" (2016). Ver formatos-fecha.ts.
 */
import type { PrecisionFecha } from './formatos-fecha';
export type { PrecisionFecha } from './formatos-fecha';

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
  /**
   * Combinación con las lecturas deterministas (combinar-fuentes.ts): fuente
   * y "Coincidente" por fecha, documentos detectados y el principal.
   */
  fuentes?: Record<CampoFecha, FuenteCampo>;
  grupos?: GrupoFechas[];
  principal?: number | null;
  /** Texto de los QR y de la cadena original (evidencia, aunque sea una URL). */
  evidenciaEstructurada?: EvidenciaEstructurada[];
  iaDisponible: boolean;
  errorMensaje?: string;
}

export interface EvidenciaEstructurada {
  pagina: number;
  origen: 'qr' | 'cadena_original';
  texto: string;
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
      // La precisión real se recalcula del texto literal al validar.
      precision: 'dia',
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

// ── Combinación con las fuentes deterministas ──────────────────────────────

/** Etiquetas del texto de cada página + QR y cadena original. */
export function lecturasDeterministas(
  doc: Pick<DocumentoLeido, 'paginas'>,
  formatoIndicado?: string | null,
): LecturaFecha[] {
  return doc.paginas.flatMap((p) => [
    ...p.estructuradas.flatMap((e) => e.lecturas),
    ...extraerPorEtiquetas(p.texto, {
      pagina: p.numero,
      fuente: 'texto',
      formatoIndicado,
    }),
  ]);
}

const sinRepetir = (xs: string[]) => [...new Set(xs)];

/**
 * Combina la respuesta de la IA ya validada con las lecturas deterministas
 * y vuelve a aplicar la validación (orden, rango, fechas futuras, tipos que
 * no vencen) a las fechas combinadas. Sin lecturas deterministas, la
 * respuesta de la IA queda igual (solo se agrega la fuente "ia").
 */
export function combinarConIa(
  tipo: TipoDocPersonal,
  validado: ExtraerDocPersonalIaResponse,
  lecturas: LecturaFecha[],
  evidencia: EvidenciaEstructurada[] = [],
): ExtraerDocPersonalIaResponse {
  const comb = combinarFuentes({ lecturas, ia: validado });
  const extra = {
    grupos: comb.grupos,
    principal: comb.principal,
    ...(evidencia.length ? { evidenciaEstructurada: evidencia } : {}),
  };
  if (comb.principal === null) {
    return { ...validado, fuentes: comb.fuentes, ...extra };
  }

  const detalle = Object.fromEntries(
    CAMPOS_FECHA.map((c) => {
      const f = comb.fuentes[c];
      const elegida = f.lecturas.find((l) => l.fuente === f.fuente);
      const fecha: FechaDetectada = {
        valor: f.valor,
        textoLiteral: elegida?.textoLiteral ?? null,
        etiqueta: elegida?.etiqueta ?? null,
        confianza: comb.confianza[c],
        precision: f.precision,
      };
      return [c, fecha];
    }),
  ) as Record<CampoFecha, FechaDetectada>;

  const final = validarFechasDocPersonal(
    tipo,
    respuestaDesdeDetalle(detalle, {
      tipoDetectado: validado.tipoDetectado,
      formatoFechaIndicado: validado.formatoFechaIndicado,
    }),
  );

  // Las fechas que la validación dejó vacías tampoco cuentan como fuente.
  const fuentes = { ...comb.fuentes };
  for (const c of CAMPOS_FECHA) {
    if (fuentes[c].valor && !final.detalle?.[c].valor) {
      fuentes[c] = {
        ...fuentes[c],
        valor: null,
        fuente: null,
        coincidente: false,
      };
    }
  }
  // Los motivos de la validación de la IA solo importan si se usó alguna
  // fecha de la IA; las deterministas ya se validaron arriba.
  const usaIa = CAMPOS_FECHA.some((c) => fuentes[c].fuente === 'ia');
  const motivos = sinRepetir([
    ...comb.motivosRevision,
    ...(usaIa ? (validado.motivosRevision ?? []) : []),
    ...(final.motivosRevision ?? []),
  ]);
  return {
    ...final,
    revisar: motivos.length > 0,
    motivosRevision: motivos,
    tipoSospechoso: final.tipoSospechoso ?? validado.tipoSospechoso ?? null,
    fechasDescartadas: sinRepetir([
      ...(validado.fechasDescartadas ?? []),
      ...(final.fechasDescartadas ?? []),
    ]),
    fuentes,
    ...extra,
  };
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
  /** Caracteres de texto extraídos del PDF que se enviaron (0 si imagen). */
  caracteresTexto?: number;
  /** Imágenes (páginas o foto) enviadas al modelo de visión. */
  imagenesEnviadas?: number;
  /** Resolución y origen de cada imagen enviada. */
  imagenesDetalle?: Array<Omit<ImagenPreparada, 'dataUrl'>>;
  /** Lo que propuso el modelo, antes de la validación en código. */
  propuestaModelo?: ExtraerDocPersonalIaResponse;
  /** Lecturas deterministas (QR, cadena original y etiquetas por página). */
  lecturasDeterministas?: LecturaFecha[];
  /** Milisegundos: lectura (texto, render, QR) y respuesta del modelo. */
  tiempos?: { lecturaMs: number; modeloMs?: number };
  /** Tokens: estimados antes de enviar y reales (usage) de la respuesta. */
  tokens?: {
    estimadoEntrada: number;
    entrada?: number;
    salida?: number;
    /** Esperas por límite por minuto antes de obtener respuesta. */
    reintentos429: number;
  };
  /** Si falló por OpenAI: tipo de error (sin saldo, límite por minuto…). */
  errorOpenAI?: {
    tipo: TipoErrorOpenAI;
    status: number;
    codigo: string | null;
  };
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
  /** Reintentos ante límite por minuto de OpenAI (429 rate_limit_exceeded). */
  reintentos?: ConfigReintentos;
  /** Para pruebas: sustituye la espera entre reintentos. */
  dormir?: (ms: number) => Promise<void>;
}

/** Tokens de entrada aproximados de una petición (para el log y el costo). */
export function estimarTokensEntrada(
  modelo: string,
  texto: string,
  imagenes: Array<Pick<ImagenPreparada, 'ancho' | 'alto' | 'parte'>>,
): number {
  return (
    tokensTexto(texto) +
    imagenes.reduce(
      (s, i) =>
        s +
        tokensImagen(modelo, i.ancho, i.alto, i.parte === 0 ? 'low' : 'high'),
      0,
    )
  );
}

interface RespuestaDelModelo {
  raw: string;
  entrada?: number;
  salida?: number;
}

/** Qué es cada imagen adjunta (el modelo las recibe en este orden). */
export function describirImagenes(imagenes: ImagenPreparada[]): string {
  const lineas = imagenes.map((img, i) => {
    const que =
      img.parte === 0
        ? `vista general de la página ${img.pagina}`
        : img.partes > 1
          ? `página ${img.pagina}, parte ${img.parte} de ${img.partes} (ampliada)`
          : `página ${img.pagina}`;
    return `- Imagen ${i + 1}: ${que}.`;
  });
  return [
    `Se adjuntan ${imagenes.length} imagen(es) del documento, revísalas todas:`,
    ...lineas,
  ].join('\n');
}

/** Envía texto y/o imágenes de páginas al modelo de visión. */
async function llamarVision(
  openai: OpenAI,
  modelo: string,
  tipo: TipoDocPersonal,
  doc: DocumentoLeido,
): Promise<RespuestaDelModelo> {
  const nota =
    doc.imagenes.length === 0
      ? ''
      : '\n\n' +
        describirImagenes(doc.imagenes) +
        (doc.texto
          ? '\nÚsalas para confirmar qué etiqueta acompaña a cada fecha.'
          : '');
  const prompt = doc.texto
    ? construirPromptDocPersonal(doc.texto, tipo)
    : construirPromptImagenDocPersonal(tipo);

  const completion = await openai.chat.completions.create(
    {
      model: modelo,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_DOC_PERSONAL },
        {
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}${nota}` },
            ...doc.imagenes.map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: img.dataUrl,
                // La vista general solo da contexto: basta la resolución baja.
                detail: img.parte === 0 ? ('low' as const) : ('high' as const),
              },
            })),
          ],
        },
      ],
      temperature: 0,
      max_tokens: 800,
    },
    // Los reintentos los maneja conReintentosOpenAI: el SDK reintentaría
    // también "insufficient_quota", que no se arregla esperando.
    { maxRetries: 0 },
  );
  return {
    raw: completion.choices[0]?.message?.content ?? '{}',
    entrada: completion.usage?.prompt_tokens,
    salida: completion.usage?.completion_tokens,
  };
}

/** Respaldo cuando no se pudo renderizar: el PDF completo a la Responses API. */
async function llamarResponsesConPdf(
  apiKey: string,
  modelo: string,
  tipo: TipoDocPersonal,
  buffer: Buffer,
): Promise<RespuestaDelModelo> {
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
    const cuerpo = await response.text();
    let error: { code?: string; type?: string } | undefined;
    try {
      error = (JSON.parse(cuerpo) as { error?: typeof error }).error;
    } catch {
      // cuerpo no JSON
    }
    // Misma forma que APIError del SDK: status, code, error y headers.
    throw Object.assign(new Error(`OpenAI Responses API: ${cuerpo}`), {
      status: response.status,
      code: error?.code ?? null,
      error,
      headers: response.headers,
    });
  }

  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    raw: quitarCercoJson(
      json.output_text ??
        json.output
          ?.flatMap((item) => item.content ?? [])
          .map((item) => item.text ?? '')
          .filter(Boolean)
          .join('\n') ??
        '{}',
    ),
    entrada: json.usage?.input_tokens,
    salida: json.usage?.output_tokens,
  };
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
  const inicioLectura = Date.now();
  try {
    doc = await leerDocumento(buffer, mimeType, opciones.lectura);
  } catch (err) {
    const msg = `${mimeType === 'application/pdf' ? 'PDF ilegible' : 'Imagen ilegible'}: ${(err as Error).message}`;
    onError(msg);
    return { resultado: sinFechas(true, msg), modelo };
  }
  if (doc.aviso) onError(doc.aviso);

  const lecturaMs = Date.now() - inicioLectura;
  const tiempos: NonNullable<ResultadoExtraccionFechas['tiempos']> = {
    lecturaMs,
  };
  // Antes de llamar al modelo: así también quedan en el diagnóstico si la
  // IA falla. Se recalculan si la IA declara el formato de fecha (mm/dd).
  const lecturasPrevias = lecturasDeterministas(doc);
  const meta = {
    tiempos,
    lecturasDeterministas: lecturasPrevias,
    origen: doc.modo,
    modelo,
    paginasTotales: doc.paginasTotales,
    paginasLeidas: doc.paginasLeidas,
    aviso: doc.aviso,
    caracteresTexto: doc.texto.length,
    imagenesEnviadas: doc.imagenes.length,
    imagenesDetalle: doc.imagenes.map((img) => ({
      ancho: img.ancho,
      alto: img.alto,
      pagina: img.pagina,
      parte: img.parte,
      partes: img.partes,
      rotacion: img.rotacion,
    })),
  };

  const estimadoEntrada =
    doc.modo === 'pdf-crudo'
      ? tokensTexto(construirPromptPdfEscaneado(tipo)) +
        // El PDF crudo se cobra como texto + imagen por página; aproximación.
        doc.paginasLeidas * tokensImagen(modelo, 1700, 2200, 'high')
      : estimarTokensEntrada(
          modelo,
          SYSTEM_PROMPT_DOC_PERSONAL +
            (doc.texto
              ? construirPromptDocPersonal(doc.texto, tipo)
              : construirPromptImagenDocPersonal(tipo)),
          doc.imagenes,
        );
  let reintentos429 = 0;
  const contexto = `modelo ${modelo}, ~${estimadoEntrada} tokens de entrada, ${doc.imagenes.length} imagen(es), tipo ${tipo}`;

  let respuesta: RespuestaDelModelo;
  const inicioModelo = Date.now();
  try {
    respuesta = await conReintentosOpenAI(
      () =>
        doc.modo === 'pdf-crudo'
          ? llamarResponsesConPdf(apiKey, modelo, tipo, buffer)
          : llamarVision(openai, modelo, tipo, doc),
      opciones.reintentos ?? CONFIG_REINTENTOS_POR_DEFECTO,
      (e, espera, intento) => {
        reintentos429++;
        onError(
          `OpenAI ${e.tipo} (${e.codigo ?? 'sin code'}, HTTP ${e.status}) — ${contexto} — intento ${intento}, se reintenta en ${Math.round(espera / 1000)} s`,
        );
      },
      opciones.dormir,
    );
  } catch (err: unknown) {
    const e = clasificarErrorOpenAI(err);
    onError(
      `OpenAI ${e.tipo} (${e.codigo ?? 'sin code'}, HTTP ${e.status}) — ${contexto}${
        reintentos429 ? ` — tras ${reintentos429} reintento(s)` : ''
      } — ${e.detalle}`,
    );
    return {
      ...meta,
      tokens: { estimadoEntrada, reintentos429 },
      errorOpenAI: { tipo: e.tipo, status: e.status, codigo: e.codigo },
      resultado: sinFechas(true, e.mensaje),
    };
  }
  tiempos.modeloMs = Date.now() - inicioModelo;
  const raw = respuesta.raw;
  const tokens = {
    estimadoEntrada,
    entrada: respuesta.entrada,
    salida: respuesta.salida,
    reintentos429,
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(quitarCercoJson(raw)) as Record<string, unknown>;
  } catch {
    onError(
      `La IA devolvió JSON inválido (${doc.modo}) para documento ${tipo}.`,
    );
    return {
      ...meta,
      tokens,
      respuestaCruda: raw,
      resultado: sinFechas(
        true,
        'Error de OpenAI: la respuesta no pudo interpretarse como JSON.',
      ),
    };
  }

  // El modelo propone; el código verifica (día/mes, INE, orden, duración,
  // tipo) y luego se combina con QR, cadena original y etiquetas del texto.
  const propuestaModelo = normalizarRespuesta(parsed);
  const validado = validarFechasDocPersonal(tipo, propuestaModelo);
  const lecturas = validado.formatoFechaIndicado
    ? lecturasDeterministas(doc, validado.formatoFechaIndicado)
    : lecturasPrevias;
  const evidencia = doc.paginas.flatMap((p) =>
    p.estructuradas.map((e) => ({
      pagina: e.pagina,
      origen: e.origen,
      texto: e.texto.slice(0, 2000),
    })),
  );
  return {
    ...meta,
    tokens,
    respuestaCruda: raw,
    propuestaModelo,
    lecturasDeterministas: lecturas,
    resultado: combinarConIa(tipo, validado, lecturas, evidencia),
  };
}
