import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  DocPersonal,
  DocPersonalDocument,
} from './schemas/doc-personal.schema';
import {
  TIPOS_DOC_PERSONAL,
  LABEL_TIPO_DOC,
  TipoDocPersonal,
} from './constants/tipos-doc-personal';
import {
  DocPersonalResponseDto,
  MisDocsResponseDto,
  ResumenTipoDto,
} from './dto/doc-personal.dto';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Carpeta Cloudinary: asommmn/documentos */
const STORAGE_CATEGORY = 'documentos';

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
const SYSTEM_PROMPT_DOC_PERSONAL = `
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
const construirPromptDocPersonal = (
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
const construirPromptImagenDocPersonal = (
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

@Injectable()
export class DocsPersonalesService {
  private readonly logger = new Logger(DocsPersonalesService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectModel(DocPersonal.name)
    private readonly docModel: Model<DocPersonalDocument>,

    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,

    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,

    private readonly storage: StorageService,

    private readonly auditoria: AuditoriaService,

    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async obtenerPostulante(
    usuarioId: string,
  ): Promise<PostulanteDocument> {
    let postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(usuarioId),
    });

    if (!postulante) {
      postulante = await this.postulanteModel.create({
        usuarioId: new Types.ObjectId(usuarioId),
        estadoPostulacion: 'en_proceso',
      });
    }

    return postulante;
  }

  private async toResponseDto(
    doc: DocPersonalDocument,
  ): Promise<DocPersonalResponseDto> {
    const storageType: 'local' | 'cloudinary' =
      doc.storageType === 'cloudinary' && doc.cloudinaryUrl
        ? 'cloudinary'
        : 'local';

    return {
      _id: doc._id.toString(),
      tipo: doc.tipo,
      nombreOriginal: doc.nombreOriginal,
      tamanio: doc.tamanio,
      tipoMime: doc.tipoMime,
      subidasEn: doc.subidasEn,

      fechaInicio: doc.fechaInicio,
      fechaVencimiento: doc.fechaVencimiento,
      fechaEmision: doc.fechaEmision,

      urlDescargar:
        storageType === 'cloudinary'
          ? await this.storage.getSecureDownloadUrl(
              doc.cloudinaryUrl!,
              doc.nombreOriginal,
              doc.tipoMime,
            )
          : undefined,

      storageType,
    };
  }

  private async buildResumen(
    docs: DocPersonalDocument[],
  ): Promise<MisDocsResponseDto> {
    const tipos: ResumenTipoDto[] = await Promise.all(
      TIPOS_DOC_PERSONAL.map(async (tipo) => {
        const archivos = await Promise.all(
          docs
            .filter((d) => d.tipo === tipo)
            .map((d) => this.toResponseDto(d)),
        );

        return {
          tipo,
          label: LABEL_TIPO_DOC[tipo],
          cantidad: archivos.length,
          archivos,
        };
      }),
    );

    const tiposConArchivos = tipos.filter((t) => t.cantidad > 0).length;

    return {
      tipos,
      totalArchivos: docs.length,
      tiposConArchivos,
    };
  }

  // ── Helpers IA ─────────────────────────────────────────────────────────────

  /**
   * Valida una fecha en formato YYYY-MM-DD.
   *
   * Evita guardar fechas inventadas o mal formadas
   * que haya podido devolver el modelo.
   */
  private normalizarFechaIa(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const fecha = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return null;
    }

    const [year, month, day] = fecha.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return fecha;
  }

  /**
   * Normaliza el nivel de confianza devuelto por la IA.
   */
  private normalizarConfianza(
    value: unknown,
  ): 'alta' | 'media' | 'baja' {
    if (value === 'alta' || value === 'media' || value === 'baja') {
      return value;
    }

    return 'baja';
  }

  /**
   * Analiza un documento personal mediante IA.
   *
   * IMPORTANTE:
   * - No guarda el documento.
   * - No modifica MongoDB.
   * - Solo analiza el archivo y devuelve las fechas detectadas.
   */
  async extraerDatosDocPersonalIa(
    fileBuffer: Buffer,
    userId: string,
    tipoDocumento: TipoDocPersonal,
    mimeType: string,
  ): Promise<ExtraerDocPersonalIaResponse> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');

    if (!apiKey) {
      return {
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
          fechaEmision: 'baja',
        },
        iaDisponible: false,
        errorMensaje:
          'IA no disponible (OPENAI_API_KEY no configurada).',
      };
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
          fechaEmision: 'baja',
        },
        iaDisponible: false,
        errorMensaje: 'El archivo está vacío.',
      };
    }

    if (!ACCEPTED_MIMES.includes(mimeType)) {
      return {
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
          fechaEmision: 'baja',
        },
        iaDisponible: true,
        errorMensaje:
          'Tipo de archivo no compatible con la extracción IA.',
      };
    }

    try {
      const modelo = this.configService.get<string>(
        'OPENAI_MODEL',
        'gpt-4o-mini',
      );

      let completion;

      // ─────────────────────────────────────────────────────────────
      // PDF
      // ─────────────────────────────────────────────────────────────

      if (mimeType === 'application/pdf') {
        const pdfParser = new PDFParse({
          data: fileBuffer,
        });

        const pdfResult = await pdfParser.getText();

        await pdfParser.destroy();

        const textoPdf = pdfResult.text?.trim() ?? '';

        if (textoPdf.length < 20) {
          // PDF escaneado: se envía el PDF directamente como archivo visual
          // a la Responses API. Esto evita depender de que pdf-parse pueda
          // extraer texto de un documento que realmente es una imagen.
          const base64Pdf = fileBuffer.toString('base64');
          const promptPdfEscaneado = `
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
                      file_data: `data:application/pdf;base64,${base64Pdf}`,
                    },
                    {
                      type: 'input_text',
                      text: `${SYSTEM_PROMPT_DOC_PERSONAL}\n${promptPdfEscaneado}`,
                    },
                  ],
                },
              ],
              temperature: 0,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw Object.assign(
              new Error(`OpenAI Responses API: ${errorText}`),
              { status: response.status },
            );
          }

          const responseJson = (await response.json()) as {
            output_text?: string;
            output?: Array<{
              content?: Array<{ text?: string }>;
            }>;
          };

          const rawResponse =
            responseJson.output_text ??
            responseJson.output
              ?.flatMap((item) => item.content ?? [])
              .map((item) => item.text ?? '')
              .filter(Boolean)
              .join('\n') ??
            '{}';

          const rawJson = rawResponse
            .replace(/^```json\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

          let parsedPdf: {
            fechaInicio?: unknown;
            fechaVencimiento?: unknown;
            fechaEmision?: unknown;
            confianza?: {
              fechaInicio?: unknown;
              fechaVencimiento?: unknown;
              fechaEmision?: unknown;
            };
          };

          try {
            parsedPdf = JSON.parse(rawJson);
          } catch {
            this.logger.error(
              `La IA devolvió JSON inválido para PDF escaneado ${tipoDocumento}.`,
            );

            return {
              fechaInicio: null,
              fechaVencimiento: null,
              fechaEmision: null,
              confianza: {
                fechaInicio: 'baja',
                fechaVencimiento: 'baja',
                fechaEmision: 'baja',
              },
              iaDisponible: true,
              errorMensaje:
                'La IA pudo abrir el PDF, pero no devolvió una respuesta interpretable.',
            };
          }

          const fechaInicio = this.normalizarFechaIa(
            parsedPdf.fechaInicio,
          );
          const fechaVencimiento = this.normalizarFechaIa(
            parsedPdf.fechaVencimiento,
          );
          const fechaEmision = this.normalizarFechaIa(
            parsedPdf.fechaEmision,
          );

          const confianza = {
            fechaInicio: this.normalizarConfianza(
              parsedPdf.confianza?.fechaInicio,
            ),
            fechaVencimiento: this.normalizarConfianza(
              parsedPdf.confianza?.fechaVencimiento,
            ),
            fechaEmision: this.normalizarConfianza(
              parsedPdf.confianza?.fechaEmision,
            ),
          };

          await this.auditoria.registrar({
            actorId: userId,
            actorEmail: userId,
            accion: 'doc_personal_extraccion_ia',
            recurso: 'DocPersonal',
            recursoId: 'extraer-ia',
            metadata: {
              modelo,
              tipoDocumento,
              mimeType,
              origen: 'pdf-visual',
              fechaInicioExtraida: fechaInicio,
              fechaVencimientoExtraida: fechaVencimiento,
              fechaEmisionExtraida: fechaEmision,
              confianza,
            },
          });

          return {
            fechaInicio,
            fechaVencimiento,
            fechaEmision,
            confianza,
            iaDisponible: true,
          };
        }

        const textoLimitado = textoPdf.slice(0, 8000);

        completion = await this.openai.chat.completions.create({
          model: modelo,
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT_DOC_PERSONAL,
            },
            {
              role: 'user',
              content: construirPromptDocPersonal(
                textoLimitado,
                tipoDocumento,
              ),
            },
          ],
          temperature: 0,
          max_tokens: 500,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // IMAGEN JPG / PNG
      // ─────────────────────────────────────────────────────────────

      else {
        const base64 = fileBuffer.toString('base64');

        const dataUrl = `data:${mimeType};base64,${base64}`;

        completion = await this.openai.chat.completions.create({
          model: modelo,
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT_DOC_PERSONAL,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: construirPromptImagenDocPersonal(
                    tipoDocumento,
                  ),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 500,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // PROCESAMIENTO DE RESPUESTA
      // ─────────────────────────────────────────────────────────────

      const raw = completion.choices[0]?.message?.content ?? '{}';

      let parsed: {
        fechaInicio?: unknown;
        fechaVencimiento?: unknown;
        fechaEmision?: unknown;
        confianza?: {
          fechaInicio?: unknown;
          fechaVencimiento?: unknown;
          fechaEmision?: unknown;
        };
      };

      try {
        parsed = JSON.parse(raw);
      } catch {
        this.logger.error(
          `La IA devolvió una respuesta JSON inválida para documento ${tipoDocumento}.`,
        );

        return {
          fechaInicio: null,
          fechaVencimiento: null,
          fechaEmision: null,
          confianza: {
            fechaInicio: 'baja',
            fechaVencimiento: 'baja',
            fechaEmision: 'baja',
          },
          iaDisponible: true,
          errorMensaje:
            'La IA devolvió una respuesta que no pudo interpretarse.',
        };
      }

      const fechaInicio = this.normalizarFechaIa(
        parsed.fechaInicio,
      );

      const fechaVencimiento = this.normalizarFechaIa(
        parsed.fechaVencimiento,
      );

      const fechaEmision = this.normalizarFechaIa(
        parsed.fechaEmision,
      );

      const confianza = {
        fechaInicio: this.normalizarConfianza(
          parsed.confianza?.fechaInicio,
        ),
        fechaVencimiento: this.normalizarConfianza(
          parsed.confianza?.fechaVencimiento,
        ),
        fechaEmision: this.normalizarConfianza(
          parsed.confianza?.fechaEmision,
        ),
      };

      // ─────────────────────────────────────────────────────────────
      // AUDITORÍA
      // ─────────────────────────────────────────────────────────────

      await this.auditoria.registrar({
        actorId: userId,
        actorEmail: userId,
        accion: 'doc_personal_extraccion_ia',
        recurso: 'DocPersonal',
        recursoId: 'extraer-ia',
        metadata: {
          modelo,
          tipoDocumento,
          mimeType,
          fechaInicioExtraida: fechaInicio,
          fechaVencimientoExtraida: fechaVencimiento,
          fechaEmisionExtraida: fechaEmision,
          confianza,
        },
      });

      return {
        fechaInicio,
        fechaVencimiento,
        fechaEmision,
        confianza,
        iaDisponible: true,
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error desconocido';

      const status =
        (err as { status?: number })?.status ??
        (err as { statusCode?: number })?.statusCode ??
        0;

      this.logger.error(
        `extraerDatosDocPersonalIa falló — HTTP ${status} — ${msg}`,
      );

      return {
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
          fechaEmision: 'baja',
        },
        iaDisponible: true,
        errorMensaje:
          status === 401
            ? 'API key de OpenAI inválida o revocada. Contacta al administrador.'
            : status === 429
              ? 'Sin crédito o cuota de OpenAI agotada. Contacta al administrador.'
              : `No se pudo analizar el documento con IA: ${msg}`,
      };
    }
  }

  // ── Postulante: subir ──────────────────────────────────────────────────────

  async subir(
    actor: AuthUser,
    tipo: TipoDocPersonal,
    file: Express.Multer.File,
  ): Promise<DocPersonalResponseDto> {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo.',
      );
    }

    if (!ACCEPTED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Sube un PDF, JPG o PNG.',
      );
    }

    if (!TIPOS_DOC_PERSONAL.includes(tipo)) {
      throw new BadRequestException(
        'Tipo de documento inválido.',
      );
    }

    const postulante = await this.obtenerPostulante(
      actor.userId,
    );

    const usuario = await this.usuarioModel
      .findById(actor.userId)
      .select('nombre apellidos')
      .lean();

    const carpeta =
      construirCarpetaPorNombre(
        usuario?.nombre,
        usuario?.apellidos,
      ) ?? actor.userId;

    const safeName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

    const key = `${carpeta}/${tipo}/${Date.now()}-${safeName}`;

    const { url, key: s3Key } =
      await this.storage.putObject(
        STORAGE_CATEGORY,
        key,
        file.buffer,
      );

    const doc = await this.docModel.create({
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(actor.userId),
      tipo,
      nombreOriginal: file.originalname,
      tipoMime: file.mimetype,
      tamanio: file.size,
      storagePath: `${STORAGE_CATEGORY}/${key}`,
      cloudinaryUrl: url,
      cloudinaryPublicId: s3Key,
      storageType: 'cloudinary',
      subidasPor: new Types.ObjectId(actor.userId),
      subidasEn: new Date(),
    });

    // Extrae automáticamente las fechas al subir el documento.
    // Si la IA falla, NO se cancela la subida: el documento permanece guardado.
    try {
      const ia = await this.extraerDatosDocPersonalIa(
        file.buffer,
        actor.userId,
        tipo,
        file.mimetype,
      );

      if (ia.iaDisponible) {
        doc.fechaInicio = ia.fechaInicio
          ? new Date(`${ia.fechaInicio}T00:00:00.000Z`)
          : undefined;

        doc.fechaVencimiento = ia.fechaVencimiento
          ? new Date(`${ia.fechaVencimiento}T00:00:00.000Z`)
          : undefined;

        doc.fechaEmision = ia.fechaEmision
          ? new Date(`${ia.fechaEmision}T00:00:00.000Z`)
          : undefined;

        await doc.save();
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron extraer las fechas del documento ${doc._id}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_subir',
      recurso: 'DocPersonal',
      recursoId: doc._id.toString(),
      metadata: {
        tipo,
        tamanio: file.size,
        nombreOriginal: file.originalname,
      },
    });

    return this.toResponseDto(doc);
  }

  // ── Postulante: listar propios ────────────────────────────────────────────

  async listarMios(
    actor: AuthUser,
  ): Promise<MisDocsResponseDto> {
    const postulante =
      await this.postulanteModel.findOne({
        usuarioId: new Types.ObjectId(actor.userId),
      });

    if (!postulante) {
      return this.buildResumen([]);
    }

    const docs = await this.docModel
      .find({
        postulanteId: postulante._id,
      })
      .sort({
        subidasEn: -1,
      });

    return this.buildResumen(docs);
  }

  // ── Postulante / Admin: eliminar ──────────────────────────────────────────

  async eliminar(
    actor: AuthUser,
    docId: string,
  ): Promise<void> {
    const doc = await this.docModel.findById(docId);

    if (!doc) {
      throw new NotFoundException(
        'Documento no encontrado.',
      );
    }

    // Postulante solo puede borrar sus propios docs
    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este documento.',
      );
    }

    if (
      doc.storageType === 'cloudinary' &&
      doc.cloudinaryPublicId
    ) {
      await this.storage.removeObject(
        doc.cloudinaryPublicId,
      );
    }

    await this.docModel.findByIdAndDelete(docId);

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_eliminar',
      recurso: 'DocPersonal',
      recursoId: docId,
      metadata: {
        tipo: doc.tipo,
        nombreOriginal: doc.nombreOriginal,
      },
    });
  }

  // ── Postulante: URL de descarga de un doc propio ─────────────────────────

  async urlDescargar(
    actor: AuthUser,
    docId: string,
  ): Promise<DocPersonalResponseDto> {
    const doc = await this.docModel.findById(docId);

    if (!doc) {
      throw new NotFoundException(
        'Documento no encontrado.',
      );
    }

    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para descargar este documento.',
      );
    }

    return this.toResponseDto(doc);
  }

  // ── Postulante: renombrar ─────────────────────────────────────────────────

  async renombrar(
    actor: AuthUser,
    docId: string,
    nuevoNombre: string,
  ): Promise<void> {
    const doc = await this.docModel.findById(docId);

    if (!doc) {
      throw new NotFoundException(
        'Documento no encontrado.',
      );
    }

    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para renombrar este documento.',
      );
    }

    const anterior = doc.nombreOriginal;

    doc.nombreOriginal = nuevoNombre.trim();

    await doc.save();

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_renombrar',
      recurso: 'DocPersonal',
      recursoId: docId,
      metadata: {
        anterior,
        nuevo: doc.nombreOriginal,
      },
    });
  }

  // ── Evaluador / Admin: listar por postulanteId ───────────────────────────

  async listarPorPostulante(
    postulanteId: string,
  ): Promise<MisDocsResponseDto> {
    const docs = await this.docModel
      .find({
        postulanteId: new Types.ObjectId(postulanteId),
      })
      .sort({
        subidasEn: -1,
      });

    return this.buildResumen(docs);
  }
}