import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  crearClienteOpenAI,
  MODELO_GENERAL_POR_DEFECTO,
} from '../../common/utils/openai-client.util';
import { PDFParse } from 'pdf-parse';
import { FORMATO_CV } from './esquema-cv';
import { seedDesdeEnv } from '../docs-personales/ia/extraer-fechas-doc-personal';
import type {
  ConfianzaIa,
  CursoCV,
  DatosCV,
} from './schemas/extraccion.schema';

const SYSTEM_PROMPT = `Eres un asistente especializado en extracción de datos curriculares.
Analiza el texto del CV y devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta.
Si un dato NO está explícitamente en el texto, usa null. NUNCA inventes ni asumas datos. Los arrays deben ser [] si no hay datos.
No incluyas markdown, no expliques nada, solo el JSON.`;

const USER_PROMPT_TEMPLATE = (
  texto: string,
) => `Extrae los datos del siguiente CV:

--- INICIO CV ---
${texto}
--- FIN CV ---

Para cada elemento del array "cursos" (cursos, certificaciones o diplomados mencionados en el CV), extrae:

- nombre: nombre oficial del curso o certificación tal como aparece en el texto. null si no se identifica con claridad.
- institucion: la institución, empresa o academia que emitió el curso/certificación.
  - Busca frases como: "expedido por", "emitido por", "otorgado por", "issued by", "certified by", "awarded by",
    o el nombre de la organización que aparece junto al curso (ej. "Cisco", "Cisco Networking Academy", "Google", "Coursera", "Universidad Cristóbal Colón").
  - null si no se menciona explícitamente la institución para ese curso.
REGLAS DE FECHAS DE CURSOS (obligatorias):
- Toda fecha debe aparecer LITERALMENTE en el CV. Si no aparece, devuelve null.
- NUNCA infieras, estimes ni calcules una fecha (por ejemplo, no sumes años de
  vigencia a una fecha de emisión, ni uses el año de un empleo o estudio).
- Normaliza al formato YYYY-MM-DD: "04 Feb 2026" → "2026-02-04", "15 de marzo de 2024" → "2024-03-15".
- Si solo aparece mes y año, o solo año, devuelve null (no inventes el día).

- fechaInicio: inicio EXPLÍCITO del curso o de la vigencia.
  - SOLO con etiquetas como "Fecha de inicio", "Inicio:", "Del ... al ...", "Start date", "Valid from".
- fechaEmision: fecha en que se expidió el certificado.
  - Etiquetas: "Expedido", "Expedición", "Emitido", "Emisión", "Fecha de expedición", "Issued", "Date of issue".
- fechaVencimiento: fin de la vigencia del certificado.
  - Etiquetas: "Vigencia", "Vigente hasta", "Vence", "Vencimiento", "Válido hasta", "Expira", "Expiry date", "Valid until".
  - La mayoría de los cursos no indican vencimiento: en ese caso null.
- Si el curso tiene UNA sola fecha, clasifícala por la palabra que la acompaña:
  - "vigencia", "vence", "válido hasta", "expira" → fechaVencimiento
  - "expedido", "emitido", "expedición", "emisión" → fechaEmision
  - "inicio", "desde" → fechaInicio
  - Si no la acompaña ninguna palabra que indique qué es, devuelve las tres en null
    (una fecha sin contexto no se puede clasificar con seguridad).
- confianza: para cada una de las tres fechas, "alta" si la etiqueta es explícita,
  "media" si la interpretaste por contexto cercano, "baja" si es null o dudosa.

Devuelve este JSON (y solo este JSON):
{
  "nombre": "string o null",
  "apellidos": "string o null",
  "email": "string o null",
  "telefono": "string o null",
  "resumen": "string o null",
  "estudios": [{ "institucion": "string", "grado": "string", "area": "string o null", "inicio": "string o null", "fin": "string o null" }],
  "experienciaLaboral": [{ "empresa": "string", "puesto": "string", "inicio": "string o null", "fin": "string o null", "descripcion": "string o null" }],
  "cursos": [{ "nombre": "string", "institucion": "string o null", "fechaInicio": "YYYY-MM-DD o null", "fechaEmision": "YYYY-MM-DD o null", "fechaVencimiento": "YYYY-MM-DD o null", "confianza": { "fechaInicio": "alta|media|baja", "fechaEmision": "alta|media|baja", "fechaVencimiento": "alta|media|baja" } }],
  "habilidades": ["string"],
  "idiomas": [{ "idioma": "string", "nivel": "string o null" }]
}`;

@Injectable()
export class OpenAiIaService {
  private readonly logger = new Logger(OpenAiIaService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.client = crearClienteOpenAI(
      this.config.get<string>('OPENAI_API_KEY', ''),
    );
    this.model = this.config.get<string>(
      'OPENAI_MODEL',
      MODELO_GENERAL_POR_DEFECTO,
    );
  }

  async extraerTextoPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.trim();
  }

  async extraerDatosCV(texto: string): Promise<DatosCV> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // Structured Outputs: siempre la misma forma, sin JSON truncado o mal formado.
      response_format: FORMATO_CV,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(texto) },
      ],
      temperature: 0,
      seed: seedDesdeEnv((k) => this.config.get<string>(k)),
      max_tokens: 4000,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    this.logger.debug(`OpenAI response: ${raw.slice(0, 200)}`);

    let datos: DatosCV;
    try {
      datos = JSON.parse(raw) as DatosCV;
    } catch {
      this.logger.warn('No se pudo parsear la respuesta de OpenAI como JSON');
      return {};
    }

    if (Array.isArray(datos.cursos)) {
      datos.cursos = datos.cursos.map((c) => sanitizarCursoCV(c));
    }
    return datos;
  }
}

/** YYYY-MM-DD de calendario válido; cualquier otra cosa → null. */
function fechaValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] &&
    d.getUTCMonth() === +m[2] - 1 &&
    d.getUTCDate() === +m[3]
    ? m[0]
    : null;
}

function confianzaValida(valor: unknown): ConfianzaIa | undefined {
  return valor === 'alta' || valor === 'media' || valor === 'baja'
    ? valor
    : undefined;
}

/**
 * Defensa ante respuestas del modelo que no respetan el formato: una fecha
 * mal formada se descarta (null) en lugar de guardarse.
 */
export function sanitizarCursoCV(curso: CursoCV): CursoCV {
  const fechaInicio = fechaValida(curso?.fechaInicio);
  const fechaEmision = fechaValida(curso?.fechaEmision);
  const fechaVencimiento = fechaValida(curso?.fechaVencimiento);
  return {
    ...curso,
    fechaInicio,
    fechaEmision,
    fechaVencimiento,
    confianza: {
      // Sin fecha, la confianza no aporta: se fija en baja.
      fechaInicio: fechaInicio
        ? confianzaValida(curso?.confianza?.fechaInicio)
        : 'baja',
      fechaEmision: fechaEmision
        ? confianzaValida(curso?.confianza?.fechaEmision)
        : 'baja',
      fechaVencimiento: fechaVencimiento
        ? confianzaValida(curso?.confianza?.fechaVencimiento)
        : 'baja',
    },
  };
}
