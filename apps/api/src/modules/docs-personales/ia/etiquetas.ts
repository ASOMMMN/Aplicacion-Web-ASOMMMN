/**
 * Etiquetas reales (español e inglés) que acompañan a las fechas en los
 * documentos del personal marítimo. Las usa el extractor determinista
 * (extractor-etiquetas.ts) y se describen al modelo en el prompt.
 *
 * Solo cuentan frases completas de etiqueta: "Fecha de Expedición" sí,
 * "Lugar de Expedición" no; "Date of issuance" sí, "Issue Port" no.
 * Nunca hay etiquetas para nacimiento, impresión, firma, sello ni folio: esas
 * fechas no se extraen.
 */
import type { CampoFecha } from './extraer-fechas-doc-personal';

export interface EtiquetaFecha {
  campo: CampoFecha;
  /** Sobre texto normalizado (minúsculas, sin acentos). */
  patron: RegExp;
}

// Todas se evalúan sobre texto normalizado (normalizarTexto).
export const ETIQUETAS: EtiquetaFecha[] = [
  // ── Vencimiento ──────────────────────────────────────────────────────────
  { campo: 'fechaVencimiento', patron: /fecha (?:en la )?(?:que|de) (?:expira|vence|vencimiento|expiracion|caducidad)(?: (?:el|del) certificado(?: medico)?)?/ },
  { campo: 'fechaVencimiento', patron: /fecha de (?:vencimiento|expiracion|caducidad|termino de (?:la )?vigencia)/ },
  { campo: 'fechaVencimiento', patron: /expiration date(?: of (?:the )?medical certificate)?|date of expiry|expiry date|date of expiration|expires? on|expires?\b(?=\s*[:-])/ },
  { campo: 'fechaVencimiento', patron: /valid(?:o|a)? (?:hasta|until|thru|through|till)(?: el)?|vigente hasta|vigencia hasta|valid thru/ },
  { campo: 'fechaVencimiento', patron: /\bvigencia\b|\bvencimiento\b|\bvence\b/ },
  // ── Emisión ──────────────────────────────────────────────────────────────
  { campo: 'fechaEmision', patron: /fecha (?:en la )?que se realizo el reconocimiento medico|date on which (?:the )?medical examination was carried out/ },
  { campo: 'fechaEmision', patron: /fecha de (?:expedicion|emision|otorgamiento|refrendo|dictamen|vacunacion|inscripcion|registro(?! de (?:la |el )?nacimiento))/ },
  { campo: 'fechaEmision', patron: /date of (?:issu(?:e|ance)|endorsement|vaccination)|issue date|issued on|issuance date/ },
  { campo: 'fechaEmision', patron: /expedid[oa] (?:el|en)\b|emitid[oa] (?:el|en)\b|se expide(?: la presente| el presente)?/ },
  { campo: 'fechaEmision', patron: /\bdictamen\b|\bemision\b/ },
  // ── Inicio ───────────────────────────────────────────────────────────────
  { campo: 'fechaInicio', patron: /(?:certificate )?valid from|valid(?:o|a) desde|vigente desde|vigencia desde|fecha de inicio|start date/ },
]; // prettier-ignore

/**
 * Contextos que invalidan una fecha aunque haya etiqueta cerca: nacimiento,
 * impresión, firma, sellos de embarque, exámenes parciales, lugar de
 * expedición…
 */
export const CONTEXTO_EXCLUIDO =
  /nacimiento|birth|impres|printed|imprimi|firma(?:do)?|signature|sello|stamp|embarque|desembarque|sign(?:ed)? (?:on|off)|lugar de expedicion|issue port|place of issue|colou?r vision|vision de colores|audiometri|examen (?:profesional|parcial)|descarga|download/;

/** Tipos cuyo documento lleva etiquetas propias además de las generales. */
export const ETIQUETAS_POR_TIPO_DESCRIPCION: Record<string, string> = {
  certificado_medico:
    'emisión = "Fecha en la que se realizó el reconocimiento médico / Date on which medical examination was carried out" o "DICTAMEN"; vencimiento = "Fecha en la que expira el certificado médico / Expiration date of medical certificate" o "VIGENCIA".',
  refrendo:
    'emisión = "Fecha de Expedición / Date of issuance"; vencimiento = "Fecha de Vencimiento / Expiration Date".',
  certificado_competencia:
    'emisión = "Fecha de expedición / Date of issue"; vencimiento = "Fecha de vencimiento / Date of expiry / Valid until".',
  libreta_identidad_maritima:
    'emisión = "Fecha de expedición / Date of issue"; vencimiento = "Fecha de vencimiento / Date of expiry / Válida hasta".',
  pasaporte:
    'emisión = "Fecha de expedición / Date of issue"; vencimiento = "Fecha de caducidad / Date of expiry".',
  visa: 'emisión = "Issue Date"; vencimiento = "Expiration Date".',
  INE: 'emisión = "EMISIÓN 2016" (solo año); vencimiento = "VIGENCIA 2016 - 2026" (solo año).',
  vacuna_fiebre_amarilla:
    'emisión = fecha de vacunación ("Date"); inicio = "Certificate valid from"; vencimiento = "until" (si dice "life of person vaccinated", no hay vencimiento).',
  constancia_participacion:
    'emisión = "Fecha de emisión (Date of issue)"; vencimiento = "Fecha de expiración (Date of expiry)" o "Vigencia".',
  curso:
    'emisión = "Fecha de emisión / expedición / Date of issue"; inicio = "Fecha de inicio / del …"; vencimiento = "Vigencia / Válido hasta / Date of expiry".',
  CURP: 'emisión = "Fecha de inscripción / registro" (no la de nacimiento); no vence.',
  acta_nacimiento:
    'emisión = fecha de expedición de la copia certificada (no la de nacimiento ni la de registro del nacimiento); no vence.',
};
