/**
 * Extracción de fechas de documentos personales con IA (OpenAI).
 *
 * Función independiente de Nest para poder usarla desde el servicio (subida
 * y POST /docs-personales/extraer-ia) y desde scripts (backfill) sin levantar
 * la aplicación. No escribe en BD ni en auditoría: eso lo hace quien llama.
 */
import OpenAI from 'openai';
import {
  CONFIG_LECTURA_POR_DEFECTO,
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
import { detectarIndicadorFormato, FormatoNumerico } from './formatos-fecha';
import { leerMrz } from './mrz';
import {
  ConsensoCampo,
  consensoLecturas,
  IdLectura,
} from './consenso-lecturas';
import type { VariantePreparacion } from './preparar-imagen';
import { formatoChat, formatoResponses } from './esquema-respuesta';
import { TIPOS_DOC_PERSONAL } from '../constants/tipos-doc-personal';

export {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  construirPromptPdfEscaneado,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from './prompts-doc-personal';

/**
 * Modelo para leer documentos: OPENAI_MODEL_DOCS, por defecto un snapshot
 * FECHADO de gpt-4o (el más reciente que devolvió models.list el
 * 2026-10-05). Un alias como "gpt-4o" cambia de versión sin aviso y con él
 * cambian las fechas leídas.
 * Medido con documentos reales: gpt-4o-mini cobra ~33× más tokens por
 * imagen (114 000–198 000 tokens de entrada por documento contra 4 400–7 900
 * con gpt-4o), agota el límite por minuto y leyó peor los escaneos.
 * OPENAI_MODEL se sigue usando para chatbot y CV.
 */
export const MODELO_DOCS_POR_DEFECTO = 'gpt-4o-2024-11-20';
export const modeloDocsDesdeEnv = (
  leer: (clave: string) => string | undefined,
): string => leer('OPENAI_MODEL_DOCS')?.trim() || MODELO_DOCS_POR_DEFECTO;

/** "gpt-4o-2024-11-20" sí; "gpt-4o" (alias que cambia de versión) no. */
export const esSnapshotFechado = (modelo: string) =>
  /-\d{4}-\d{2}-\d{2}$/.test(modelo.trim());

/** Semilla fija para que OpenAI repita la misma salida (best effort). */
export const SEED_POR_DEFECTO = 20261005;
export const seedDesdeEnv = (
  leer: (clave: string) => string | undefined,
): number => {
  const n = Number(leer('OPENAI_SEED'));
  return leer('OPENAI_SEED')?.trim() && Number.isInteger(n)
    ? n
    : SEED_POR_DEFECTO;
};

/**
 * Versión de la canalización (lectura + prompts + validación + consenso).
 * Forma parte de la clave de la caché y se guarda en cada análisis: un
 * análisis de una versión anterior se puede reemplazar al reanalizar.
 * Subirla cuando un cambio altere las fechas que se obtienen.
 */
export const VERSION_CANALIZACION = '2026-10-05';

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
  /** Qué tan seguro está el modelo del tipo detectado. */
  confianzaTipo?: Confianza;
  /** Cada lectura del modelo (doble lectura) con sus fechas validadas. */
  lecturasIa?: ResumenLecturaIa[];
  /** Consenso por campo entre lecturas (si hubo más de una). */
  consenso?: Record<CampoFecha, ConsensoCampo>;
  /** Se reextrajo con las reglas del tipo detectado (no del elegido). */
  reextraccion?: { tipoElegido: string; tipoUsado: string } | null;
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

/** Lo que dijo una lectura del modelo (evidencia para auditoría). */
export interface ResumenLecturaIa {
  id: IdLectura;
  variante: VariantePreparacion;
  tipoDetectado: string | null;
  confianzaTipo: Confianza | null;
  fechas: Record<
    CampoFecha,
    Pick<FechaDetectada, 'valor' | 'precision' | 'textoLiteral' | 'confianza'>
  >;
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
    'tipoDetectado' | 'formatoFechaIndicado' | 'confianzaTipo'
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
    confianzaTipo: normalizarConfianza(parsed.confianzaTipo),
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

/** Vencimiento de la MRZ de la capa de texto (dígito verificador correcto). */
function lecturaMrz(
  texto: string,
  pagina: number,
  tipo?: TipoDocPersonal,
): LecturaFecha[] {
  const mrz = leerMrz(texto);
  if (!mrz) return [];
  // INE: la vigencia se maneja como año (31/12); la MRZ dice lo mismo.
  const anio = tipo === 'INE' && mrz.vencimiento.endsWith('-12-31');
  return [
    {
      fuente: 'texto',
      campo: 'fechaVencimiento',
      etiqueta: `MRZ ${mrz.formato}`,
      textoLiteral: mrz.linea,
      valor: mrz.vencimiento,
      precision: anio ? 'anio' : 'dia',
      clave: anio ? mrz.vencimiento.slice(0, 4) : mrz.vencimiento,
      pagina,
      grupo: 0,
      posicion: Math.max(
        0,
        texto.toUpperCase().indexOf(mrz.linea.slice(0, 10)),
      ),
    },
  ];
}

/** Etiquetas del texto de cada página, MRZ, QR y cadena original. */
export function lecturasDeterministas(
  doc: Pick<DocumentoLeido, 'paginas'>,
  formatoIndicado?: string | null,
  tipo?: TipoDocPersonal,
): LecturaFecha[] {
  return doc.paginas.flatMap((p) => [
    ...p.estructuradas.flatMap((e) => e.lecturas),
    ...extraerPorEtiquetas(p.texto, {
      pagina: p.numero,
      fuente: 'texto',
      formatoIndicado,
    }),
    ...lecturaMrz(p.texto, p.numero, tipo),
  ]);
}

/**
 * Formato numérico comprobado: solo si el documento lo declara por escrito
 * (capa de texto) o aparece en lo que el modelo copió del documento
 * (texto literal o etiqueta). Lo que el modelo diga en formatoFechaIndicado
 * no cuenta: sin indicador, dd/mm.
 */
export function formatoComprobado(
  doc: Pick<DocumentoLeido, 'paginas'>,
  propuesta?: ExtraerDocPersonalIaResponse,
): FormatoNumerico | null {
  const deModelo = CAMPOS_FECHA.flatMap((c) => [
    propuesta?.detalle?.[c].textoLiteral,
    propuesta?.detalle?.[c].etiqueta,
  ]);
  return (
    detectarIndicadorFormato(...doc.paginas.map((p) => p.texto)) ??
    detectarIndicadorFormato(...deModelo)
  );
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
      confianzaTipo: validado.confianzaTipo,
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
  /** Respuesta cruda de cada lectura (ia1, ia2, ia3). */
  respuestasCrudas?: string[];
  /** Versión de la canalización que produjo este resultado. */
  versionCanalizacion?: string;
  /** Semilla enviada a OpenAI. */
  seed?: number;
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
  /** Semilla para OpenAI (por defecto SEED_POR_DEFECTO). */
  seed?: number;
  /** Interno: no volver a extraer con el tipo detectado (evita bucles). */
  sinReextraer?: boolean;
  /** Interno: documento ya leído (la reextracción no lo vuelve a leer). */
  documentoLeido?: DocumentoLeido;
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
  seed: number,
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
      // Structured Outputs: el modelo solo puede devolver este esquema.
      response_format: formatoChat(tipo),
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
                // La vista general solo da contexto: basta la resolución baja
                // (salvo en la variante "alterna", que la pide en alta).
                detail:
                  img.detalle ??
                  (img.parte === 0 ? ('low' as const) : ('high' as const)),
              },
            })),
          ],
        },
      ],
      temperature: 0,
      seed,
      max_tokens: 1000,
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

/**
 * Respaldo cuando no se pudo renderizar: el PDF completo a la Responses API,
 * con el mismo esquema estricto y un tope de tokens de salida. Esta API no
 * acepta `seed`: la repetibilidad aquí depende del consenso y de la caché.
 */
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
      text: { format: formatoResponses(tipo) },
      temperature: 0,
      max_output_tokens: 1200,
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
 * ¿La IA dice otra cosa que las lecturas deterministas en algún campo?
 * (Solo campos donde ambas tienen fecha.)
 */
export function iaDifiereDeDeterministas(
  ia: ExtraerDocPersonalIaResponse,
  lecturas: LecturaFecha[],
): boolean {
  if (lecturas.length === 0) return false;
  const { fuentes } = combinarFuentes({ lecturas, ia });
  return CAMPOS_FECHA.some((c) => {
    const delIa = fuentes[c].lecturas.find((l) => l.fuente === 'ia');
    const det = fuentes[c].lecturas.find((l) => l.fuente !== 'ia');
    return Boolean(delIa && det && delIa.clave !== det.clave);
  });
}

/** Lo que se guarda como evidencia de una lectura. */
function resumenLectura(
  id: IdLectura,
  variante: VariantePreparacion,
  r: ExtraerDocPersonalIaResponse,
): ResumenLecturaIa {
  return {
    id,
    variante,
    tipoDetectado: r.tipoDetectado ?? null,
    confianzaTipo: r.confianzaTipo ?? null,
    fechas: Object.fromEntries(
      CAMPOS_FECHA.map((c) => {
        const f = r.detalle?.[c];
        return [
          c,
          {
            valor: f?.valor ?? null,
            precision: f?.precision ?? 'dia',
            textoLiteral: f?.textoLiteral ?? null,
            confianza: f?.confianza ?? 'baja',
          },
        ];
      }),
    ) as ResumenLecturaIa['fechas'],
  };
}

/** Resultado de una llamada al modelo ya interpretado y validado. */
interface LecturaModelo {
  id: IdLectura;
  variante: VariantePreparacion;
  raw: string;
  propuesta: ExtraerDocPersonalIaResponse;
  validado: ExtraerDocPersonalIaResponse;
}

type FalloLectura =
  | { fallo: 'openai'; error: ReturnType<typeof clasificarErrorOpenAI> }
  | { fallo: 'json'; raw: string };

const LECTURAS: Array<{ id: IdLectura; variante: VariantePreparacion }> = [
  { id: 'ia1', variante: 'normal' },
  { id: 'ia2', variante: 'alterna' },
  { id: 'ia3', variante: 'desempate' },
];

/**
 * Analiza un documento y devuelve solo las fechas que aparecen
 * explícitamente. Nunca lanza: los errores vuelven en `errorMensaje`.
 *
 * Lecturas del modelo:
 * - Imagen, foto o escaneo: siempre dos lecturas con preparaciones
 *   distintas; si no coinciden, una tercera de desempate (consenso).
 * - PDF con texto: una lectura; dos o tres solo si la IA y las lecturas
 *   deterministas (etiquetas, QR, MRZ) no coinciden.
 * - Si el modelo reconoce otro tipo de documento con confianza alta, se
 *   vuelve a extraer con las reglas de ese tipo y se marca tipoSospechoso.
 */
export async function extraerFechasDocPersonal(
  opciones: OpcionesExtraccionFechas,
): Promise<ResultadoExtraccionFechas> {
  const { buffer, mimeType, tipo, apiKey, modelo } = opciones;
  const onError = opciones.onError ?? ((m: string) => console.error(m));
  const seed = opciones.seed ?? SEED_POR_DEFECTO;
  const cfgLectura = opciones.lectura ?? CONFIG_LECTURA_POR_DEFECTO;
  const comun = { versionCanalizacion: VERSION_CANALIZACION, seed };

  if (!apiKey?.trim()) {
    const msg =
      'Falta la API key de OpenAI: OPENAI_API_KEY no está configurada en el servidor.';
    onError(`extraerFechasDocPersonal (${tipo}): ${msg}`);
    return { resultado: sinFechas(false, msg), modelo, ...comun };
  }
  if (!buffer || buffer.length === 0) {
    return {
      resultado: sinFechas(false, 'El archivo está vacío.'),
      modelo,
      ...comun,
    };
  }
  if (!MIMES_EXTRACCION_IA.includes(mimeType)) {
    return {
      resultado: sinFechas(
        true,
        'Tipo de archivo no compatible con la extracción IA.',
      ),
      modelo,
      ...comun,
    };
  }

  const openai = opciones.openai ?? new OpenAI({ apiKey });

  let doc: DocumentoLeido;
  const inicioLectura = Date.now();
  try {
    doc =
      opciones.documentoLeido ??
      (await leerDocumento(buffer, mimeType, {
        ...cfgLectura,
        variante: 'normal',
      }));
  } catch (err) {
    const msg = `${mimeType === 'application/pdf' ? 'PDF ilegible' : 'Imagen ilegible'}: ${(err as Error).message}`;
    onError(msg);
    return { resultado: sinFechas(true, msg), modelo, ...comun };
  }
  if (doc.aviso) onError(doc.aviso);

  const tiempos: NonNullable<ResultadoExtraccionFechas['tiempos']> = {
    lecturaMs: Date.now() - inicioLectura,
    modeloMs: 0,
  };
  // Antes de llamar al modelo: así también quedan en el diagnóstico si la
  // IA falla. Se recalculan si el formato comprobado cambia con lo que el
  // modelo copió del documento.
  const formatoDoc = formatoComprobado(doc);
  const lecturasPrevias = lecturasDeterministas(doc, formatoDoc, tipo);
  const meta = {
    ...comun,
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
  const tokens: NonNullable<ResultadoExtraccionFechas['tokens']> = {
    estimadoEntrada,
    entrada: 0,
    salida: 0,
    reintentos429: 0,
  };
  const contexto = `modelo ${modelo}, ~${estimadoEntrada} tokens de entrada por lectura, ${doc.imagenes.length} imagen(es), tipo ${tipo}`;

  /** Una lectura del modelo: llamada (con reintentos 429), JSON y validación. */
  const leerConModelo = async (
    id: IdLectura,
    variante: VariantePreparacion,
    d: DocumentoLeido,
  ): Promise<LecturaModelo | FalloLectura> => {
    let respuesta: RespuestaDelModelo;
    const inicio = Date.now();
    try {
      respuesta = await conReintentosOpenAI(
        () =>
          d.modo === 'pdf-crudo'
            ? llamarResponsesConPdf(apiKey, modelo, tipo, buffer)
            : llamarVision(openai, modelo, tipo, d, seed),
        opciones.reintentos ?? CONFIG_REINTENTOS_POR_DEFECTO,
        (e, espera, intento) => {
          tokens.reintentos429++;
          onError(
            `OpenAI ${e.tipo} (${e.codigo ?? 'sin code'}, HTTP ${e.status}) — ${contexto} — ${id}, intento ${intento}, se reintenta en ${Math.round(espera / 1000)} s`,
          );
        },
        opciones.dormir,
      );
    } catch (err: unknown) {
      const e = clasificarErrorOpenAI(err);
      onError(
        `OpenAI ${e.tipo} (${e.codigo ?? 'sin code'}, HTTP ${e.status}) — ${contexto} — ${id}${
          tokens.reintentos429
            ? ` — tras ${tokens.reintentos429} reintento(s)`
            : ''
        } — ${e.detalle}`,
      );
      return { fallo: 'openai', error: e };
    } finally {
      tiempos.modeloMs = (tiempos.modeloMs ?? 0) + (Date.now() - inicio);
    }
    tokens.entrada = (tokens.entrada ?? 0) + (respuesta.entrada ?? 0);
    tokens.salida = (tokens.salida ?? 0) + (respuesta.salida ?? 0);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(quitarCercoJson(respuesta.raw)) as Record<
        string,
        unknown
      >;
    } catch {
      onError(
        `La IA devolvió JSON inválido (${d.modo}, ${id}) para documento ${tipo}.`,
      );
      return { fallo: 'json', raw: respuesta.raw };
    }
    // El modelo propone; el código verifica (día/mes, INE, orden, duración,
    // tipo) contra el texto literal, con el formato comprobado.
    const propuesta = normalizarRespuesta(parsed);
    const validado = validarFechasDocPersonal(tipo, {
      ...propuesta,
      formatoFechaIndicado: formatoComprobado(doc, propuesta),
    });
    return { id, variante, raw: respuesta.raw, propuesta, validado };
  };

  /** Documento con otra preparación de imágenes (sin volver a buscar QR). */
  const releer = async (
    variante: VariantePreparacion,
  ): Promise<DocumentoLeido | null> => {
    if (doc.modo === 'pdf-crudo') return doc;
    const inicio = Date.now();
    try {
      return await leerDocumento(buffer, mimeType, {
        ...cfgLectura,
        variante,
        maxPaginasQr: 0,
      });
    } catch (err) {
      onError(
        `No se pudo preparar la lectura ${variante}: ${(err as Error).message}`,
      );
      return null;
    } finally {
      tiempos.lecturaMs += Date.now() - inicio;
    }
  };

  // ── Lectura 1 ──
  const r1 = await leerConModelo('ia1', 'normal', doc);
  if ('fallo' in r1) {
    return r1.fallo === 'openai'
      ? {
          ...meta,
          tokens,
          errorOpenAI: {
            tipo: r1.error.tipo,
            status: r1.error.status,
            codigo: r1.error.codigo,
          },
          resultado: sinFechas(true, r1.error.mensaje),
        }
      : {
          ...meta,
          tokens,
          respuestaCruda: r1.raw,
          resultado: sinFechas(
            true,
            'Error de OpenAI: la respuesta no pudo interpretarse como JSON.',
          ),
        };
  }

  // ── Lecturas 2 y 3 (consenso) ──
  const hechas: LecturaModelo[] = [r1];
  const motivosLectura: string[] = [];
  const lecturasDe = (f: string | null | undefined) =>
    (f ?? null) !== formatoDoc
      ? lecturasDeterministas(doc, f, tipo)
      : lecturasPrevias;
  const visual = doc.modo !== 'pdf-texto';
  const pedirSegunda =
    visual ||
    iaDifiereDeDeterministas(
      r1.validado,
      lecturasDe(r1.validado.formatoFechaIndicado),
    );

  const intentar = async (n: 1 | 2): Promise<LecturaModelo | null> => {
    const { id, variante } = LECTURAS[n];
    const d = await releer(variante);
    if (!d) return null;
    const r = await leerConModelo(id, variante, d);
    if ('fallo' in r) {
      motivosLectura.push(
        r.fallo === 'openai'
          ? `No se pudo hacer la lectura de confirmación (${id}): ${r.error.mensaje}`
          : `La lectura de confirmación (${id}) no devolvió JSON válido.`,
      );
      return null;
    }
    return r;
  };

  let consenso: ReturnType<typeof consensoLecturas> | null = null;
  if (pedirSegunda) {
    const r2 = await intentar(1);
    if (r2) {
      hechas.push(r2);
      consenso = consensoLecturas(
        hechas.map((l) => ({ id: l.id, resultado: l.validado })),
      );
      if (consenso.requiereDesempate) {
        const r3 = await intentar(2);
        if (r3) {
          hechas.push(r3);
          consenso = consensoLecturas(
            hechas.map((l) => ({ id: l.id, resultado: l.validado })),
          );
        } else {
          motivosLectura.push(
            'Las dos lecturas de la IA no coinciden y no se pudo desempatar; se usó la primera.',
          );
        }
      }
    } else if (visual) {
      motivosLectura.push(
        'La fecha no se confirmó con una segunda lectura de la IA.',
      );
    }
  }

  // Resultado de la IA: el consenso (vuelto a validar) o la única lectura.
  let validado: ExtraerDocPersonalIaResponse;
  if (consenso) {
    const v = validarFechasDocPersonal(tipo, consenso.resultado);
    validado = {
      ...v,
      motivosRevision: [
        ...new Set([...consenso.motivos, ...(v.motivosRevision ?? [])]),
      ],
    };
  } else {
    validado = r1.validado;
  }
  if (motivosLectura.length) {
    // Sin confirmación, ninguna fecha de la IA queda en "alta".
    const detalle = validado.detalle
      ? (Object.fromEntries(
          CAMPOS_FECHA.map((c) => {
            const f = validado.detalle![c];
            return [
              c,
              {
                ...f,
                confianza: f.confianza === 'alta' ? 'media' : f.confianza,
              },
            ];
          }),
        ) as Record<CampoFecha, FechaDetectada>)
      : undefined;
    validado = {
      ...validado,
      ...(detalle
        ? {
            detalle,
            confianza: {
              fechaEmision: detalle.fechaEmision.confianza,
              fechaInicio: detalle.fechaInicio.confianza,
              fechaVencimiento: detalle.fechaVencimiento.confianza,
            },
          }
        : {}),
      motivosRevision: [
        ...new Set([...(validado.motivosRevision ?? []), ...motivosLectura]),
      ],
    };
  }
  validado.revisar = (validado.motivosRevision ?? []).length > 0;

  // ── Tipo equivocado: reextraer con las reglas del tipo detectado ──
  const detectado = validado.tipoDetectado?.trim();
  if (
    !opciones.sinReextraer &&
    detectado &&
    detectado !== tipo &&
    validado.confianzaTipo === 'alta' &&
    (TIPOS_DOC_PERSONAL as readonly string[]).includes(detectado)
  ) {
    const otro = await extraerFechasDocPersonal({
      ...opciones,
      tipo: detectado as TipoDocPersonal,
      sinReextraer: true,
      documentoLeido: doc,
    });
    if (!otro.resultado.errorMensaje) {
      const motivo = `El contenido corresponde a ${detectado}, no a ${tipo}: las fechas se extrajeron con las reglas de ${detectado}. Confirma el tipo.`;
      const motivos = [
        ...new Set([...(otro.resultado.motivosRevision ?? []), motivo]),
      ];
      return {
        ...otro,
        tokens: {
          estimadoEntrada,
          entrada: (tokens.entrada ?? 0) + (otro.tokens?.entrada ?? 0),
          salida: (tokens.salida ?? 0) + (otro.tokens?.salida ?? 0),
          reintentos429:
            tokens.reintentos429 + (otro.tokens?.reintentos429 ?? 0),
        },
        respuestasCrudas: [
          ...hechas.map((l) => l.raw),
          ...(otro.respuestasCrudas ?? []),
        ],
        resultado: {
          ...otro.resultado,
          tipoSospechoso: { tipoElegido: tipo, tipoDetectado: detectado },
          reextraccion: { tipoElegido: tipo, tipoUsado: detectado },
          motivosRevision: motivos,
          revisar: true,
        },
      };
    }
    onError(
      `No se pudo reextraer como ${detectado}: ${otro.resultado.errorMensaje}`,
    );
  }

  // ── Combinación con las lecturas deterministas ──
  const lecturas = lecturasDe(validado.formatoFechaIndicado);
  const evidencia = doc.paginas.flatMap((p) =>
    p.estructuradas.map((e) => ({
      pagina: e.pagina,
      origen: e.origen,
      texto: e.texto.slice(0, 2000),
    })),
  );
  const combinado = combinarConIa(tipo, validado, lecturas, evidencia);
  return {
    ...meta,
    tokens,
    respuestaCruda: r1.raw,
    respuestasCrudas: hechas.map((l) => l.raw),
    propuestaModelo: r1.propuesta,
    lecturasDeterministas: lecturas,
    resultado: {
      ...combinado,
      confianzaTipo: validado.confianzaTipo,
      lecturasIa: hechas.map((l) =>
        resumenLectura(l.id, l.variante, l.validado),
      ),
      ...(consenso ? { consenso: consenso.porCampo } : {}),
      reextraccion: null,
    },
  };
}
