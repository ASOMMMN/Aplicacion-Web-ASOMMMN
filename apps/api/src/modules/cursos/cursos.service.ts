import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Tab,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { Curso, CursoDocument } from './schemas/curso.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateCursoDto } from './dto/create-curso.dto';
import {
  CursosListResponseDto,
  ExtraerIaResponseDto,
} from './dto/curso-response.dto';

const SYSTEM_PROMPT_CURSO = `Eres un extractor experto de datos de certificados académicos y diplomas de cursos.
Analiza únicamente el contenido del texto del documento (nunca el nombre del archivo).
Devuelve SOLO un objeto JSON válido, sin markdown ni explicaciones adicionales.
Si un dato NO está explícitamente en el documento, usa null. NUNCA inventes ni asumas datos.`;

const userPromptCurso = (
  texto: string,
) => `Extrae los datos del siguiente certificado o diploma de curso:

--- INICIO DOCUMENTO ---
${texto.slice(0, 4000)}
--- FIN DOCUMENTO ---

Extrae exactamente estos campos:

1. nombreCurso: Nombre oficial del curso/certificación del CUERPO del documento.
   - Busca el texto que aparece después de frases como: "por completar con éxito:", "por haber completado:",
     "certifica que ... completó:", "has completed:", "successfully completed:", "completion of:",
     "for completing:", "certifies that ... has successfully completed:", o el título principal del módulo/curso.
   - En certificados Cisco Networking Academy suele ser el nombre del módulo: "Defensa de la red",
     "Python Essentials 1", "CCNA: Introduction to Networks", etc.
   - NUNCA uses el nombre del archivo, el nombre del receptor, ni el nombre de la institución emisora.
   - Si no identificas claramente el nombre del curso, usa null.

2. fechaInicio: Fecha de inicio EXPLÍCITA en formato YYYY-MM-DD.
   - SOLO si el documento dice "Fecha de inicio", "Start date", "Inicio:" o equivalente.
   - null si no hay fecha de inicio explícita en el documento.

3. fechaVencimiento: Fecha de vencimiento o expiración en formato YYYY-MM-DD.
   - SOLO si el documento dice "Válido hasta", "Expira:", "Expiry date", "Valid until" o equivalente.
   - null si no hay fecha de vencimiento (la mayoría de certificados no vencen).

4. fechaEmision: Fecha de finalización, emisión o expedición en formato YYYY-MM-DD.
   - Busca: "Fecha de Finalización", "Fecha de emisión", "Fecha de expedición", "Completion date",
     "Issue date", "Date awarded", "Awarded on", "Issued on", "Fecha de Expedición" o equivalente.
   - Normaliza cualquier formato o idioma: "04 Feb 2026" → "2026-02-04", "15 de marzo de 2024" → "2024-03-15".
   - null si no existe ninguna fecha de este tipo en el documento.

5. confianza: Nivel de confianza "alta" | "media" | "baja" para nombreCurso, fechaInicio y fechaVencimiento.

Devuelve SOLO este JSON (sin texto adicional):
{
  "nombreCurso": "string o null",
  "fechaInicio": "YYYY-MM-DD o null",
  "fechaVencimiento": "YYYY-MM-DD o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "confianza": {
    "nombreCurso": "alta|media|baja",
    "fechaInicio": "alta|media|baja",
    "fechaVencimiento": "alta|media|baja"
  }
}`;

const CURSOS_CATEGORY = 'cursos';
const ALLOWED_EXTRA_MIME = ['application/pdf'];

@Injectable()
export class CursosService {
  private readonly logger = new Logger(CursosService.name);

  constructor(
    @InjectModel(Curso.name)
    private readonly cursoModel: Model<CursoDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly storageService: StorageService,
    private readonly auditoriaService: AuditoriaService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
  }

  private readonly openai: OpenAI;

  async crearCurso(
    userId: string,
    dto: CreateCursoDto,
    file?: Express.Multer.File,
  ): Promise<{ message: string; cursoId: string }> {
    try {
      const postulante = await this.getPostulanteByUserId(userId);

      if (!dto.apareceEnCV && !file) {
        throw new BadRequestException(
          'Si el curso no aparece en el CV, debes subir documento extra.',
        );
      }

      let documentoExtra: Curso['documentoExtra'];
      if (file) {
        this.validarDocumentoExtra(file);
        const key = `postulante-${userId}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

        await this.storageService.putObject(
          CURSOS_CATEGORY,
          key,
          file.buffer,
          file.mimetype,
        );

        documentoExtra = {
          storagePath: `${CURSOS_CATEGORY}/${key}`,
          nombreOriginal: file.originalname,
          tipoMime: file.mimetype,
          tamanio: file.size,
          subidoEn: new Date(),
        };
      }

      const fechaCurso = new Date(dto.fechaCurso);
      if (Number.isNaN(fechaCurso.getTime())) {
        throw new BadRequestException('Fecha de curso inválida.');
      }

      const fechaInicio = dto.fechaInicio
        ? new Date(dto.fechaInicio)
        : undefined;
      let fechaVencimiento = dto.fechaVencimiento
        ? new Date(dto.fechaVencimiento)
        : undefined;
      if (fechaInicio && !fechaVencimiento) {
        fechaVencimiento = new Date(fechaInicio);
        fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 5);
      }

      const curso = await this.cursoModel.create({
        postulanteId: postulante._id,
        usuarioId: new Types.ObjectId(userId),
        nombreCurso: dto.nombreCurso.trim(),
        institucion: dto.institucion?.trim() || undefined,
        fechaCurso,
        fechaInicio,
        fechaVencimiento,
        apareceEnCV: dto.apareceEnCV,
        documentoExtra,
      });

      return {
        message: 'Curso/certificación registrado correctamente.',
        cursoId: curso._id.toString(),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al registrar curso/certificación: ${msg}`);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Error al subir el certificado. Verifica el archivo e inténtalo de nuevo.',
      );
    }
  }

  async listarMisCursos(userId: string): Promise<CursosListResponseDto> {
    const postulante = await this.getPostulanteByUserId(userId);
    const usuario = await this.usuarioModel.findById(userId).lean();

    const cursos = await this.cursoModel
      .find({ postulanteId: postulante._id })
      .sort({ fechaCurso: -1, creadoEn: -1 })
      .lean();

    const mapped = cursos.map((curso) => {
      let documentoExtra:
        | {
            nombreOriginal: string;
            tamanio: number;
            tipoMime: string;
            urlDescargar: string;
          }
        | undefined;
      if (curso.documentoExtra?.storagePath) {
        const [cat, ...rest] = curso.documentoExtra.storagePath.split('/');
        documentoExtra = {
          nombreOriginal: curso.documentoExtra.nombreOriginal,
          tamanio: curso.documentoExtra.tamanio,
          tipoMime: curso.documentoExtra.tipoMime,
          urlDescargar: this.storageService.getSecureDownloadUrl(
            cat,
            rest.join('/'),
            curso.documentoExtra.nombreOriginal,
            curso.documentoExtra.tipoMime,
          ),
        };
      }

      return {
        _id: curso._id.toString(),
        nombreCurso: curso.nombreCurso,
        institucion: curso.institucion,
        fechaCurso: new Date(curso.fechaCurso).toISOString(),
        fechaInicio: curso.fechaInicio
          ? new Date(curso.fechaInicio).toISOString()
          : undefined,
        fechaVencimiento: curso.fechaVencimiento
          ? new Date(curso.fechaVencimiento).toISOString()
          : undefined,
        apareceEnCV: Boolean(curso.apareceEnCV),
        tieneDocumentoExtra: Boolean(curso.documentoExtra),
        documentoExtra,
        creadoEn: new Date(curso.creadoEn).toISOString(),
      };
    });

    return {
      postulante: {
        id: postulante._id.toString(),
        nombreCompleto:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        email: usuario?.email ?? '',
      },
      cursos: mapped,
      total: mapped.length,
    };
  }

  async listarCursosPorPostulante(
    postulanteId: string,
  ): Promise<CursosListResponseDto> {
    const postulante = await this.postulanteModel.findById(postulanteId).lean();
    if (!postulante) throw new NotFoundException('Postulante no encontrado.');

    const usuario = await this.usuarioModel
      .findById(postulante.usuarioId)
      .lean();
    const cursos = await this.cursoModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .sort({ fechaCurso: -1, creadoEn: -1 })
      .lean();

    const mapped = cursos.map((curso) => {
      let documentoExtra:
        | {
            nombreOriginal: string;
            tamanio: number;
            tipoMime: string;
            urlDescargar: string;
          }
        | undefined;
      if (curso.documentoExtra?.storagePath) {
        const [cat, ...rest] = curso.documentoExtra.storagePath.split('/');
        documentoExtra = {
          nombreOriginal: curso.documentoExtra.nombreOriginal,
          tamanio: curso.documentoExtra.tamanio,
          tipoMime: curso.documentoExtra.tipoMime,
          urlDescargar: this.storageService.getSecureDownloadUrl(
            cat,
            rest.join('/'),
            curso.documentoExtra.nombreOriginal,
            curso.documentoExtra.tipoMime,
          ),
        };
      }

      return {
        _id: curso._id.toString(),
        nombreCurso: curso.nombreCurso,
        institucion: curso.institucion,
        fechaCurso: new Date(curso.fechaCurso).toISOString(),
        fechaInicio: curso.fechaInicio
          ? new Date(curso.fechaInicio).toISOString()
          : undefined,
        fechaVencimiento: curso.fechaVencimiento
          ? new Date(curso.fechaVencimiento).toISOString()
          : undefined,
        apareceEnCV: Boolean(curso.apareceEnCV),
        tieneDocumentoExtra: Boolean(curso.documentoExtra),
        documentoExtra,
        creadoEn: new Date(curso.creadoEn).toISOString(),
      };
    });

    return {
      postulante: {
        id: postulanteId,
        nombreCompleto:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        email: usuario?.email ?? '',
      },
      cursos: mapped,
      total: mapped.length,
    };
  }

  async eliminarCurso(
    userId: string,
    cursoId: string,
  ): Promise<{ message: string }> {
    const curso = await this.cursoModel.findById(cursoId);
    if (!curso)
      throw new NotFoundException('Curso/certificación no encontrado.');

    if (curso.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes eliminar cursos de otro usuario.',
      );
    }

    if (curso.documentoExtra?.storagePath) {
      const [cat, ...rest] = curso.documentoExtra.storagePath.split('/');
      await this.storageService.removeObject(cat, rest.join('/'));
    }

    await this.cursoModel.deleteOne({ _id: curso._id });

    return { message: 'Curso/certificación eliminado.' };
  }

  async renombrarCurso(
    userId: string,
    cursoId: string,
    nombreCurso: string,
  ): Promise<{ message: string }> {
    const curso = await this.cursoModel.findById(cursoId);
    if (!curso)
      throw new NotFoundException('Curso/certificación no encontrado.');
    if (curso.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes modificar cursos de otro usuario.',
      );
    }

    const anterior = curso.nombreCurso;
    curso.nombreCurso = nombreCurso.trim();
    await curso.save();

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: userId,
      accion: 'curso_renombrar',
      recurso: 'Curso',
      recursoId: cursoId,
      metadata: { anterior, nuevo: curso.nombreCurso },
    });

    return { message: 'Nombre actualizado.' };
  }

  async extraerDatosCursoIa(
    fileBuffer: Buffer,
    userId: string,
  ): Promise<ExtraerIaResponseDto> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      return {
        nombreCurso: null,
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          nombreCurso: 'baja',
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
        },
        iaDisponible: false,
        errorMensaje: 'IA no disponible (OPENAI_API_KEY no configurada).',
      };
    }

    try {
      const pdfParser = new PDFParse({ data: fileBuffer });
      const pdfResult = await pdfParser.getText();
      await pdfParser.destroy();
      const textoPdf = pdfResult.text;
      if (!textoPdf || textoPdf.trim().length < 20) {
        return {
          nombreCurso: null,
          fechaInicio: null,
          fechaVencimiento: null,
          fechaEmision: null,
          confianza: {
            nombreCurso: 'baja',
            fechaInicio: 'baja',
            fechaVencimiento: 'baja',
          },
          iaDisponible: true,
          errorMensaje:
            'El PDF no contiene texto legible. Ingresa los datos manualmente.',
        };
      }

      const modelo = this.configService.get<string>(
        'OPENAI_MODEL',
        'gpt-4o-mini',
      );
      const completion = await this.openai.chat.completions.create({
        model: modelo,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_CURSO },
          { role: 'user', content: userPromptCurso(textoPdf) },
        ],
        temperature: 0,
        max_tokens: 600,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as {
        nombreCurso?: string | null;
        fechaInicio?: string | null;
        fechaVencimiento?: string | null;
        fechaEmision?: string | null;
        confianza?: {
          nombreCurso?: string;
          fechaInicio?: string;
          fechaVencimiento?: string;
        };
      };

      await this.auditoriaService.registrar({
        actorId: userId,
        actorEmail: userId,
        accion: 'curso_extraccion_ia',
        recurso: 'Curso',
        recursoId: 'extraer-ia',
        metadata: {
          modelo,
          nombreExtraido: parsed.nombreCurso,
          fechaInicioExtraida: parsed.fechaInicio,
          fechaEmisionExtraida: parsed.fechaEmision,
        },
      });

      let fechaVencSugerida: string | null = parsed.fechaVencimiento ?? null;
      let confianzaVenc = parsed.confianza?.fechaVencimiento ?? 'baja';
      if (parsed.fechaInicio && !parsed.fechaVencimiento) {
        const inicio = new Date(parsed.fechaInicio);
        if (!isNaN(inicio.getTime())) {
          const venc = new Date(inicio);
          venc.setFullYear(venc.getFullYear() + 5);
          fechaVencSugerida = venc.toISOString().slice(0, 10);
          confianzaVenc = 'media';
        }
      }

      return {
        nombreCurso: parsed.nombreCurso ?? null,
        fechaInicio: parsed.fechaInicio ?? null,
        fechaVencimiento: fechaVencSugerida,
        fechaEmision: parsed.fechaEmision ?? null,
        confianza: {
          nombreCurso: parsed.confianza?.nombreCurso ?? 'baja',
          fechaInicio: parsed.confianza?.fechaInicio ?? 'baja',
          fechaVencimiento: confianzaVenc,
        },
        iaDisponible: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const status =
        (err as { status?: number })?.status ??
        (err as { statusCode?: number })?.statusCode ??
        0;
      this.logger.error(
        `extraerDatosCursoIa falló — HTTP ${status} — ${msg}`,
        CursosService.name,
      );
      return {
        nombreCurso: null,
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          nombreCurso: 'baja',
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
        },
        iaDisponible: true,
        errorMensaje:
          status === 401
            ? 'API key de OpenAI inválida o revocada. Contacta al administrador.'
            : status === 429
              ? 'Sin crédito o cuota de OpenAI agotada. Contacta al administrador.'
              : `No se pudo analizar el PDF con IA: ${msg}`,
      };
    }
  }

  async exportarResumenCSV(
    userId: string,
  ): Promise<{ filename: string; csv: string }> {
    const data = await this.listarMisCursos(userId);
    return this.construirResumenCSV(data);
  }

  async exportarResumenTXT(
    userId: string,
  ): Promise<{ filename: string; txt: string }> {
    const data = await this.listarMisCursos(userId);
    return this.construirResumenTXT(data);
  }

  async exportarResumenCSVPorPostulante(
    postulanteId: string,
  ): Promise<{ filename: string; csv: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    return this.construirResumenCSV(data);
  }

  async exportarResumenTXTPorPostulante(
    postulanteId: string,
  ): Promise<{ filename: string; txt: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    return this.construirResumenTXT(data);
  }

  private construirResumenCSV(data: CursosListResponseDto): {
    filename: string;
    csv: string;
  } {
    const escapeCsv = (val: string) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['Nombre del postulante', 'Curso', 'Fecha'].join(',');
    const rows = data.cursos.map((curso) =>
      [
        data.postulante.nombreCompleto,
        curso.nombreCurso,
        curso.fechaCurso.slice(0, 10),
      ]
        .map(escapeCsv)
        .join(','),
    );
    return {
      filename: `resumen-cursos-${this.normalizarNombreArchivo(data.postulante.nombreCompleto)}.csv`,
      csv: [headers, ...rows].join('\n'),
    };
  }

  /**
   * Lee el escudo de la Asociación desde apps/web/public (carpeta estática
   * compartida del monorepo) para incluirlo en el membrete del PDF/DOCX.
   * Devuelve null si el archivo no está disponible, para no romper la
   * generación del documento en ese caso.
   */
  private leerEscudoAsociacion(): Buffer | null {
    const rutaEscudo = join(
      process.cwd(),
      '..',
      'web',
      'public',
      'escudo-ASOMMMN-transparente.png',
    );
    if (!existsSync(rutaEscudo)) {
      this.logger.warn(
        `No se encontró el escudo de la asociación en ${rutaEscudo}`,
      );
      return null;
    }
    return readFileSync(rutaEscudo);
  }

  private construirResumenTXT(data: CursosListResponseDto): {
    filename: string;
    txt: string;
  } {
    const lineasCursos =
      data.cursos.length === 0
        ? ['Sin cursos registrados.']
        : data.cursos.map(
            (curso) =>
              `${curso.fechaCurso.slice(0, 10)} - ${curso.nombreCurso}`,
          );
    return {
      filename: `resumen-cursos-${this.normalizarNombreArchivo(data.postulante.nombreCompleto)}.txt`,
      txt: [data.postulante.nombreCompleto, ...lineasCursos].join('\n'),
    };
  }

  async exportarResumenDocPorPostulante(
    postulanteId: string,
    formato: 'docx' | 'pdf',
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    const slug = this.normalizarNombreArchivo(data.postulante.nombreCompleto);
    if (formato === 'docx') {
      const buffer = await this.construirResumenDOCX(data);
      return {
        filename: `resumen-cursos-${slug}.docx`,
        buffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    const buffer = await this.construirResumenPDF(data);
    return {
      filename: `resumen-cursos-${slug}.pdf`,
      buffer,
      mimeType: 'application/pdf',
    };
  }

  private async construirResumenDOCX(
    data: CursosListResponseDto,
  ): Promise<Buffer> {
    const escudo = this.leerEscudoAsociacion();
    const ESCUDO_SIZE_DOCX = 70;

    const parrafos: Paragraph[] = [
      ...(escudo
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children: [
                new ImageRun({
                  type: 'png',
                  data: escudo,
                  transformation: {
                    width: ESCUDO_SIZE_DOCX,
                    height: ESCUDO_SIZE_DOCX,
                  },
                }),
              ],
            }),
          ]
        : []),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional',
            bold: true,
            size: 30,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: '', italics: true, size: 24 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'REGISTRO No. 13 SECRETARIA DEL TRABAJO Y PREVISION SOCIAL',
            size: 18,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX,
          },
        ],
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: 'F.T.I.T.M',
            size: 18,
            font: 'Times New Roman',
          }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({
            text: 'I.T.F',
            size: 18,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        border: {
          bottom: {
            color: 'C9A24B',
            size: 12,
            style: BorderStyle.SINGLE,
          },
        },
        spacing: { before: 80, after: 220 },
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: data.postulante.nombreCompleto,
            bold: true,
            size: 28,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: 'Constancia de Cursos y Certificaciones',
            size: 24,
          }),
        ],
      }),
    ];

    if (data.cursos.length === 0) {
      parrafos.push(new Paragraph({ text: 'Sin cursos registrados.' }));
    } else {
      data.cursos.forEach((curso) => {
        const fechaInicio = this.formatearFechaResumen(
          curso.fechaInicio ?? curso.fechaCurso,
        );
        const fechaVencimiento = curso.fechaVencimiento
          ? this.formatearFechaResumen(curso.fechaVencimiento)
          : 'No especificada';

        parrafos.push(
          new Paragraph({
            spacing: { after: curso.institucion ? 40 : 80 },
            children: [
              new TextRun({ text: curso.nombreCurso, bold: true, size: 22 }),
            ],
          }),
        );
        if (curso.institucion) {
          parrafos.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: curso.institucion,
                  size: 18,
                  color: '666666',
                }),
              ],
            }),
          );
        }
        parrafos.push(
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({ text: `Inicio: ${fechaInicio}`, size: 20 }),
              new TextRun({ text: '    ', size: 20 }),
              new TextRun({ text: `Vence: ${fechaVencimiento}`, size: 20 }),
            ],
          }),
        );
      });
    }

    const doc = new Document({ sections: [{ children: parrafos }] });
    return Packer.toBuffer(doc);
  }

  private construirResumenPDF(data: CursosListResponseDto): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const escudo = this.leerEscudoAsociacion();
      const ESCUDO_SIZE_PDF = 70;
      if (escudo) {
        const escudoX = (doc.page.width - ESCUDO_SIZE_PDF) / 2;
        doc.image(escudo, escudoX, doc.y, {
          width: ESCUDO_SIZE_PDF,
          height: ESCUDO_SIZE_PDF,
        });
        doc.y += ESCUDO_SIZE_PDF + 10;
      }

      doc
        .font('Times-Bold')
        .fontSize(18)
        .text(
          'Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional',
          { align: 'center' },
        );
      doc.moveDown(0.3);
      doc.font('Times-Italic').fontSize(14).text('', { align: 'center' });
      doc.moveDown(0.25);
      doc
        .font('Times-Roman')
        .fontSize(9)
        .text('REGISTRO No. 13 SECRETARIA DEL TRABAJO Y PREVISION SOCIAL', {
          align: 'center',
        });
      doc.moveDown(0.35);
      const siglasY = doc.y;
      doc.font('Times-Roman').fontSize(9);
      doc.text('F.T.I.T.M', 50, siglasY, { align: 'left' });
      doc.text('I.T.F', 50, siglasY, { align: 'right' });
      doc.y = siglasY + 18;
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .lineWidth(1.5)
        .strokeColor('#C9A24B')
        .stroke()
        .strokeColor('#000000');
      doc.moveDown(1);
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(data.postulante.nombreCompleto);
      doc.moveDown(0.25);
      doc
        .font('Helvetica')
        .fontSize(12)
        .text('Constancia de Cursos y Certificaciones');
      doc.moveDown(0.8);

      if (data.cursos.length === 0) {
        doc.font('Helvetica').fontSize(11).text('Sin cursos registrados.');
      } else {
        data.cursos.forEach((curso) => {
          const fechaInicio = this.formatearFechaResumen(
            curso.fechaInicio ?? curso.fechaCurso,
          );
          const fechaVencimiento = curso.fechaVencimiento
            ? this.formatearFechaResumen(curso.fechaVencimiento)
            : 'No especificada';

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(curso.nombreCurso, { continued: false });
          if (curso.institucion) {
            doc
              .font('Helvetica')
              .fontSize(10)
              .fillColor('#666666')
              .text(curso.institucion)
              .fillColor('#000000');
          }
          doc
            .font('Helvetica')
            .fontSize(10)
            .text(`Inicio: ${fechaInicio}    Vence: ${fechaVencimiento}`);
          doc.moveDown(0.3);
        });
      }

      doc.end();
    });
  }

  private formatearFechaResumen(fecha: string): string {
    const [fechaIso] = fecha.split('T');
    const [anio, mes, dia] = fechaIso.split('-');
    if (!anio || !mes || !dia) return fecha;
    return `${dia}/${mes}/${anio}`;
  }

  private normalizarNombreArchivo(nombreCompleto: string): string {
    return (
      nombreCompleto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_') || 'postulante'
    );
  }

  private async getPostulanteByUserId(
    userId: string,
  ): Promise<PostulanteDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Usuario autenticado inválido.');
    }
    const objectId = new Types.ObjectId(userId);
    const postulante = await this.postulanteModel.findOne({
      usuarioId: objectId,
    });
    if (postulante) return postulante;

    this.logger.warn(
      `Perfil de postulante no encontrado para usuario ${userId}. Creando perfil automático.`,
    );

    return this.postulanteModel.create({
      usuarioId: objectId,
      estadoPostulacion: 'en_proceso',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });
  }

  private validarDocumentoExtra(file: Express.Multer.File): void {
    if (!ALLOWED_EXTRA_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        'Documento extra inválido. Solo se permite PDF.',
      );
    }
  }
}
