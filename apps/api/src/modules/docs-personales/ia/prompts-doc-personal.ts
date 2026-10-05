/**
 * Prompts para extraer fechas de documentos personales.
 *
 * Estructura: prompt base (reglas generales, formato de fecha y salida) +
 * reglas por tipo con las etiquetas reales que aparecen en cada documento.
 * La validación posterior (orden, duración, dd/mm) se hace en código:
 * ver validar-fechas-doc-personal.ts.
 */
import {
  LABEL_TIPO_DOC,
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import { ETIQUETAS_POR_TIPO_DESCRIPCION } from './etiquetas';

export const SYSTEM_PROMPT_DOC_PERSONAL = `
Eres un extractor experto de fechas de documentos oficiales mexicanos e
internacionales usados por personal marítimo (gente de mar).

REGLAS GENERALES (obligatorias):
1. Usa ÚNICAMENTE el contenido del documento (texto e imágenes). Nunca el nombre del archivo.
2. Nunca inventes ni calcules fechas. La única excepción es la regla de precisión "anio" descrita abajo.
3. Solo extrae fechas acompañadas de una etiqueta que indique qué son.
4. Ignora siempre: fecha de nacimiento, fecha de impresión, fecha de descarga, fecha de captura,
   fechas de pruebas o exámenes parciales, fechas de firma y fechas de trámites anteriores.
5. Si hay imágenes, léelas todas: las etiquetas suelen estar en español e inglés
   ("Fecha de expedición / Date of issue").

FORMATO DE FECHA (muy importante):
- En México las fechas numéricas se escriben DÍA/MES/AÑO (dd/mm/aaaa).
- Si el documento indica el formato POR ESCRITO ("dd/mm/aaaa", "dd/mm/yyyy", "DD MM YYYY",
  "mm/dd/yyyy"), respétalo e infórmalo en "formatoFechaIndicado"; si no lo indica, null.
- Si no hay indicación, interpreta SIEMPRE como dd/mm/aaaa, también en documentos en inglés
  emitidos en México.
- Si día y mes son ambos ≤ 12 y no hay indicación de formato, usa dd/mm y pon confianza "media"
  como máximo (nunca "alta").
- Meses con letra (ENE, FEB, MAR, ABR, MAY, JUN, JUL, AGO, SEP, OCT, NOV, DIC /
  JAN, APR, AUG, DEC…) no son ambiguos.
- Devuelve el valor normalizado como AAAA-MM-DD.
- Precisión "anio": solo cuando las reglas del tipo lo indiquen expresamente (INE).

SALIDA: JSON con el esquema indicado, sin markdown ni explicaciones.
`;

/** Reglas específicas con las etiquetas reales de cada tipo. */
export const REGLAS_POR_TIPO: Record<TipoDocPersonal, string> = {
  certificado_medico: `
CERTIFICADO MÉDICO MARÍTIMO (Medical certificate for service at sea):
- fechaEmision = "Fecha en la que se realizó el reconocimiento médico" /
  "Date on which medical examination was carried out".
  Si no existe, usa "Fecha de expedición del certificado" / "Date of issue of certificate".
- fechaVencimiento = "Fecha en la que expira el certificado médico" /
  "Expiration date of medical certificate" (también "Válido hasta" / "Valid until").
- fechaInicio = null salvo que diga explícitamente "válido desde" / "valid from".
- NO uses: fecha de la prueba de visión de colores / date of colour vision test,
  fecha de audiometría, fecha de nacimiento.`,

  libreta_identidad_maritima: `
LIBRETA DE MAR E IDENTIDAD MARÍTIMA (Seafarer's identity document / Seaman's book):
- fechaEmision = "Fecha de expedición" / "Date of issue" / "Fecha de emisión".
- fechaVencimiento = "Fecha de vencimiento" / "Date of expiry" / "Válida hasta" / "Valid until".
- Revisa la página de datos; ignora sellos de embarque/desembarque y registros de servicio.
- Las fechas numéricas son dd/mm/aaaa: "09/02/2022" es 9 de febrero de 2022.`,

  pasaporte: `
PASAPORTE:
- fechaEmision = "Fecha de expedición" / "Date of issue".
- fechaVencimiento = "Fecha de caducidad" / "Date of expiry".
- Suelen escribirse "09 02 2022" o "09 FEB/FEB 2022" (día mes año).
- Si aparece la zona de lectura mecánica (dos líneas con "<<<"), la caducidad está en la
  segunda línea en formato AAMMDD: úsala para confirmar día y mes.
- NO uses "Fecha de nacimiento / Date of birth".`,

  certificado_competencia: `
CERTIFICADO DE COMPETENCIA (STCW, Certificate of Competency / título profesional marítimo):
- fechaEmision = "Fecha de expedición" / "Date of issue".
- fechaVencimiento = "Fecha de vencimiento" / "Date of expiry" / "Válido hasta" / "Valid until".
- NO uses la fecha del examen profesional, de titulación ni de curso como emisión.`,

  refrendo: `
REFRENDO (Endorsement, p. ej. refrendo de reconocimiento STCW regla I/10 o refrendo del título):
- fechaEmision = "Fecha de expedición" / "Date of issue" / "Fecha de refrendo".
- fechaVencimiento = "Válido hasta" / "Valid until" / "Fecha de vencimiento" / "Date of expiry".
- La vigencia del certificado original no es la del refrendo si ambas aparecen: usa la del refrendo.`,

  INE: `
CREDENCIAL PARA VOTAR (INE):
- La vigencia aparece solo como año: "VIGENCIA 2031" o "VIGENCIA 2021 - 2031".
  En ese caso fechaVencimiento = 31 de diciembre del ÚLTIMO año (AAAA-12-31) con precision "anio",
  y textoLiteral con el texto tal cual (p. ej. "VIGENCIA 2021 - 2031").
- fechaEmision: "EMISIÓN 2021" es solo año → valor null (no inventes día ni mes), pero
  pon el texto en textoLiteral.
- NO uses "FECHA DE NACIMIENTO" ni "AÑO DE REGISTRO".`,

  CURP: `
CURP (constancia de la Clave Única de Registro de Población):
- No vence: fechaVencimiento = null siempre.
- fechaEmision = "Fecha de inscripción" / "Fecha de registro" si aparece.
- NO uses la fecha de nacimiento ni la fecha de impresión o descarga de la constancia.`,

  acta_nacimiento: `
ACTA DE NACIMIENTO:
- No vence: fechaVencimiento = null siempre.
- fechaEmision = fecha de expedición de la copia certificada ("Fecha de expedición",
  "Se expide la presente… a los DD días del mes de MES de AAAA").
- NO uses la fecha de nacimiento ni la fecha de registro del nacimiento como emisión.`,

  visa: `
VISA:
- fechaEmision = "Issue Date" / "Fecha de expedición".
- fechaVencimiento = "Expiration Date" / "Fecha de vencimiento".
- Las visas de EE. UU. escriben "09FEB2022" (día, mes con letra, año).
- NO uses "Birth Date".`,

  vacuna_fiebre_amarilla: `
CERTIFICADO INTERNACIONAL DE VACUNACIÓN (fiebre amarilla):
- fechaEmision = "Fecha" / "Date" de la vacunación contra fiebre amarilla.
- fechaInicio = "Certificado válido desde" / "Certificate valid from".
- fechaVencimiento = "hasta" / "until" solo si es una fecha; si dice
  "vida de la persona vacunada" / "life of person vaccinated", fechaVencimiento = null.`,

  constancia_participacion: `
CONSTANCIA DE PARTICIPACIÓN:
- fechaEmision = fecha en que se expide la constancia ("Se expide la presente…", "Fecha de expedición").
- fechaInicio = inicio del periodo de participación si aparece ("del … al …").
- fechaVencimiento = null salvo que el documento diga explícitamente "vigencia" o "válido hasta".`,
};

const ESQUEMA_SALIDA = `
CAMPOS DE LA RESPUESTA (el esquema JSON se aplica automáticamente):
- "tipoDetectado": qué documento es REALMENTE según su contenido (no según lo que dijo el usuario),
  uno de: ${[...TIPOS_DOC_PERSONAL, 'curso', 'otro'].join(', ')}. Usa "otro" si no corresponde a ninguno.
- "confianzaTipo": "alta" solo si el contenido identifica el tipo sin lugar a dudas.
- "formatoFechaIndicado": solo si el documento declara por escrito el formato de sus fechas; si no, null.
- "fechaEmision", "fechaInicio", "fechaVencimiento": cada una con "valor" (AAAA-MM-DD),
  "textoLiteral", "etiqueta", "confianza" (alta|media|baja) y "precision" (dia|mes|anio).
- "textoLiteral": copia exacta SOLO del fragmento con esa fecha (p. ej. "19/12/2027" o
  "VIGENCIA 2031"), sin las fechas de los otros campos.
- Si una fecha no aparece, su objeto lleva valor null, textoLiteral null y confianza "baja".`;

/** Etiquetas reales del tipo (las mismas que usa el extractor determinista). */
function etiquetasDelTipo(tipo: TipoDocPersonal): string {
  const d = ETIQUETAS_POR_TIPO_DESCRIPCION[tipo];
  return d
    ? `\nETIQUETAS QUE ACOMPAÑAN A LAS FECHAS EN ESTE TIPO:\n- ${d}\n`
    : '';
}

function encabezado(tipo: TipoDocPersonal): string {
  return `
TIPO DE DOCUMENTO QUE INDICÓ EL USUARIO: ${tipo} (${LABEL_TIPO_DOC[tipo]})

REGLAS ESPECÍFICAS DEL TIPO:
${REGLAS_POR_TIPO[tipo]}
${etiquetasDelTipo(tipo)}
Si el contenido NO corresponde a ese tipo, indícalo en "tipoDetectado" y aplica
las reglas generales para extraer las fechas.`;
}

/** PDF con texto (se acompaña de la imagen de la primera página). */
export const construirPromptDocPersonal = (
  texto: string,
  tipo: TipoDocPersonal,
): string => `
Analiza el siguiente documento personal.
${encabezado(tipo)}

TEXTO EXTRAÍDO DEL DOCUMENTO:
--- INICIO ---
${texto}
--- FIN ---
${ESQUEMA_SALIDA}`;

/** Imagen o páginas renderizadas de un PDF. */
export const construirPromptImagenDocPersonal = (
  tipo: TipoDocPersonal,
): string => `
Analiza visualmente las imágenes del siguiente documento personal.
${encabezado(tipo)}
${ESQUEMA_SALIDA}`;

/** Respaldo: PDF completo cuando no se pudo renderizar. */
export const construirPromptPdfEscaneado = (tipo: TipoDocPersonal): string => `
Analiza visualmente el PDF completo del documento personal (léelo página por página).
${encabezado(tipo)}
${ESQUEMA_SALIDA}`;
