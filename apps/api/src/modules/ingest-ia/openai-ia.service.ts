import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import type { DatosCV } from './schemas/extraccion.schema';

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
- fechaInicio: fecha de inicio EXPLÍCITA en formato YYYY-MM-DD.
  - SOLO si el texto dice "Fecha de inicio", "Start date", "Inicio:" o equivalente.
  - null si no hay fecha de inicio explícita en el texto.
- fechaVencimiento: fecha de vencimiento o expiración en formato YYYY-MM-DD.
  - SOLO si el texto dice "Válido hasta", "Expira:", "Expiry date", "Valid until" o equivalente.
  - null si no hay fecha de vencimiento explícita (la mayoría de certificados no vencen).
  - Normaliza cualquier formato o idioma al extraer: "04 Feb 2026" → "2026-02-04", "15 de marzo de 2024" → "2024-03-15".

Devuelve este JSON (y solo este JSON):
{
  "nombre": "string o null",
  "apellidos": "string o null",
  "email": "string o null",
  "telefono": "string o null",
  "resumen": "string o null",
  "estudios": [{ "institucion": "string", "grado": "string", "area": "string o null", "inicio": "string o null", "fin": "string o null" }],
  "experienciaLaboral": [{ "empresa": "string", "puesto": "string", "inicio": "string o null", "fin": "string o null", "descripcion": "string o null" }],
  "cursos": [{ "nombre": "string", "institucion": "string o null", "fechaInicio": "YYYY-MM-DD o null", "fechaVencimiento": "YYYY-MM-DD o null" }],
  "habilidades": ["string"],
  "idiomas": [{ "idioma": "string", "nivel": "string o null" }]
}`;

@Injectable()
export class OpenAiIaService {
  private readonly logger = new Logger(OpenAiIaService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY', ''),
    });
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(texto) },
      ],
      temperature: 0,
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    this.logger.debug(`OpenAI response: ${raw.slice(0, 200)}`);

    try {
      return JSON.parse(raw) as DatosCV;
    } catch {
      this.logger.warn('No se pudo parsear la respuesta de OpenAI como JSON');
      return {};
    }
  }
}
