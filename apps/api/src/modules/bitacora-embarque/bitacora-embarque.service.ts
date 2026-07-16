import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

import { Embarque, EmbarqueDocument } from './schemas/embarque.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateEmbarqueDto } from './dto/create-embarque.dto';
import { UpdateEmbarqueDto } from './dto/update-embarque.dto';
import {
  BitacoraEmbarqueListResponseDto,
  DuracionResponseDto,
  TiempoTotalResponseDto,
} from './dto/embarque-response.dto';
import { calcularDuracion, calcularTiempoTotal } from './utils/duracion.util';

@Injectable()
export class BitacoraEmbarqueService {
  private readonly logger = new Logger(BitacoraEmbarqueService.name);

  constructor(
    @InjectModel(Embarque.name)
    private readonly embarqueModel: Model<EmbarqueDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async crearEmbarque(
    userId: string,
    userEmail: string,
    dto: CreateEmbarqueDto,
  ): Promise<{ message: string; embarqueId: string }> {
    const postulante = await this.getPostulanteByUserId(userId);
    const { fechaEmbarco, fechaDesembarco } = this.parseFechas(
      dto.fechaEmbarco,
      dto.fechaDesembarco,
    );

    const embarque = await this.embarqueModel.create({
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(userId),
      fechaEmbarco,
      fechaDesembarco,
      naviera: dto.naviera.trim(),
      nombreNave: dto.nombreNave.trim(),
      tipoMaquina: dto.tipoMaquina.trim(),
      potenciaKW: dto.potenciaKW,
      tipoNave: dto.tipoNave.trim(),
      rango: dto.rango.trim(),
      bandera: dto.bandera.trim(),
    });

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: userEmail,
      accion: 'embarque_crear',
      recurso: 'Embarque',
      recursoId: embarque._id.toString(),
      metadata: { nombreNave: embarque.nombreNave },
    });

    return {
      message: 'Embarque registrado correctamente.',
      embarqueId: embarque._id.toString(),
    };
  }

  async editarEmbarque(
    userId: string,
    userEmail: string,
    embarqueId: string,
    dto: UpdateEmbarqueDto,
  ): Promise<{ message: string }> {
    const embarque = await this.embarqueModel.findById(embarqueId);
    if (!embarque) throw new NotFoundException('Embarque no encontrado.');
    if (embarque.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes modificar embarques de otro usuario.',
      );
    }

    const fechaEmbarco = dto.fechaEmbarco
      ? new Date(dto.fechaEmbarco)
      : embarque.fechaEmbarco;
    const fechaDesembarco = dto.fechaDesembarco
      ? new Date(dto.fechaDesembarco)
      : embarque.fechaDesembarco;
    this.validarRangoFechas(fechaEmbarco, fechaDesembarco);

    embarque.fechaEmbarco = fechaEmbarco;
    embarque.fechaDesembarco = fechaDesembarco;
    if (dto.naviera !== undefined) embarque.naviera = dto.naviera.trim();
    if (dto.nombreNave !== undefined)
      embarque.nombreNave = dto.nombreNave.trim();
    if (dto.tipoMaquina !== undefined)
      embarque.tipoMaquina = dto.tipoMaquina.trim();
    if (dto.potenciaKW !== undefined) embarque.potenciaKW = dto.potenciaKW;
    if (dto.tipoNave !== undefined) embarque.tipoNave = dto.tipoNave.trim();
    if (dto.rango !== undefined) embarque.rango = dto.rango.trim();
    if (dto.bandera !== undefined) embarque.bandera = dto.bandera.trim();

    await embarque.save();

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: userEmail,
      accion: 'embarque_editar',
      recurso: 'Embarque',
      recursoId: embarqueId,
      metadata: { nombreNave: embarque.nombreNave },
    });

    return { message: 'Embarque actualizado.' };
  }

  async eliminarEmbarque(
    userId: string,
    userEmail: string,
    embarqueId: string,
  ): Promise<{ message: string }> {
    const embarque = await this.embarqueModel.findById(embarqueId);
    if (!embarque) throw new NotFoundException('Embarque no encontrado.');
    if (embarque.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes eliminar embarques de otro usuario.',
      );
    }

    await this.embarqueModel.deleteOne({ _id: embarque._id });

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: userEmail,
      accion: 'embarque_eliminar',
      recurso: 'Embarque',
      recursoId: embarqueId,
      metadata: { nombreNave: embarque.nombreNave },
    });

    return { message: 'Embarque eliminado.' };
  }

  async listarMisEmbarques(
    userId: string,
  ): Promise<BitacoraEmbarqueListResponseDto> {
    const postulante = await this.getPostulanteByUserId(userId);
    const usuario = await this.usuarioModel.findById(userId).lean();
    return this.construirListado(postulante, usuario);
  }

  async listarEmbarquesPorPostulante(
    postulanteId: string,
  ): Promise<BitacoraEmbarqueListResponseDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('Postulante inválido.');
    }
    const postulante = await this.postulanteModel.findById(postulanteId).lean();
    if (!postulante) throw new NotFoundException('Postulante no encontrado.');

    const usuario = await this.usuarioModel
      .findById(postulante.usuarioId)
      .lean();
    return this.construirListado(postulante, usuario);
  }

  private async construirListado(
    postulante: { _id: Types.ObjectId },
    usuario: { nombre?: string; apellidos?: string; email?: string } | null,
  ): Promise<BitacoraEmbarqueListResponseDto> {
    const embarques = await this.embarqueModel
      .find({ postulanteId: postulante._id })
      .sort({ fechaEmbarco: -1 })
      .lean();

    let totalDiasAcumulado = 0;
    const mapped = embarques.map((embarque) => {
      const duracion = calcularDuracion(
        new Date(embarque.fechaEmbarco),
        new Date(embarque.fechaDesembarco),
      );
      totalDiasAcumulado += duracion.totalDias;

      return {
        _id: embarque._id.toString(),
        fechaEmbarco: new Date(embarque.fechaEmbarco).toISOString(),
        fechaDesembarco: new Date(embarque.fechaDesembarco).toISOString(),
        naviera: embarque.naviera,
        nombreNave: embarque.nombreNave,
        tipoMaquina: embarque.tipoMaquina,
        potenciaKW: embarque.potenciaKW,
        tipoNave: embarque.tipoNave,
        rango: embarque.rango,
        bandera: embarque.bandera,
        duracion,
        creadoEn: new Date(embarque.creadoEn).toISOString(),
      };
    });

    return {
      postulante: {
        id: postulante._id.toString(),
        nombreCompleto:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        email: usuario?.email ?? '',
      },
      embarques: mapped,
      total: mapped.length,
      tiempoTotal: calcularTiempoTotal(totalDiasAcumulado),
    };
  }

  private parseFechas(
    fechaEmbarcoRaw: string,
    fechaDesembarcoRaw: string,
  ): { fechaEmbarco: Date; fechaDesembarco: Date } {
    const fechaEmbarco = new Date(fechaEmbarcoRaw);
    const fechaDesembarco = new Date(fechaDesembarcoRaw);
    if (Number.isNaN(fechaEmbarco.getTime())) {
      throw new BadRequestException('Fecha de embarco inválida.');
    }
    if (Number.isNaN(fechaDesembarco.getTime())) {
      throw new BadRequestException('Fecha de desembarco inválida.');
    }
    this.validarRangoFechas(fechaEmbarco, fechaDesembarco);
    return { fechaEmbarco, fechaDesembarco };
  }

  private validarRangoFechas(fechaEmbarco: Date, fechaDesembarco: Date): void {
    if (fechaDesembarco.getTime() < fechaEmbarco.getTime()) {
      throw new BadRequestException(
        'La fecha de desembarco no puede ser anterior a la fecha de embarco.',
      );
    }
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

  async exportarBitacoraDocPorPostulante(
    postulanteId: string,
    formato: 'docx' | 'pdf',
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const data = await this.listarEmbarquesPorPostulante(postulanteId);
    const slug = this.normalizarNombreArchivo(data.postulante.nombreCompleto);
    const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (formato === 'docx') {
      const buffer = await this.construirBitacoraDOCX(data);
      return {
        filename: `Bitacora-Embarque-${slug}-${fechaHoy}.docx`,
        buffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    const buffer = await this.construirBitacoraPDF(data);
    return {
      filename: `Bitacora-Embarque-${slug}-${fechaHoy}.pdf`,
      buffer,
      mimeType: 'application/pdf',
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

  private async construirBitacoraDOCX(
    data: BitacoraEmbarqueListResponseDto,
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
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: data.postulante.nombreCompleto,
            bold: true,
            size: 28,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: data.postulante.email,
            size: 18,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: 'Bitácora de Embarque', size: 24 })],
      }),
      new Paragraph({
        spacing: { after: 260 },
        children: [
          new TextRun({
            text: `Tiempo total de mar: ${this.formatearTiempoTotal(data.tiempoTotal)}`,
            bold: true,
            size: 24,
            color: '0A2240',
          }),
        ],
      }),
    ];

    if (data.embarques.length === 0) {
      parrafos.push(new Paragraph({ text: 'Sin embarques registrados.' }));
    } else {
      data.embarques.forEach((embarque) => {
        const fechaEmbarco = this.formatearFechaResumen(embarque.fechaEmbarco);
        const fechaDesembarco = this.formatearFechaResumen(
          embarque.fechaDesembarco,
        );

        parrafos.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `${embarque.nombreNave} — ${embarque.naviera}`,
                bold: true,
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `Embarco: ${fechaEmbarco}    Desembarco: ${fechaDesembarco}    Duración: ${this.formatearDuracion(embarque.duracion)}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `Tipo de máquina: ${embarque.tipoMaquina}    Potencia: ${embarque.potenciaKW} KW`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: `Tipo de nave: ${embarque.tipoNave}    Rango: ${embarque.rango}    Bandera: ${embarque.bandera}`,
                size: 20,
              }),
            ],
          }),
        );
      });
    }

    const doc = new Document({ sections: [{ children: parrafos }] });
    return Packer.toBuffer(doc);
  }

  private construirBitacoraPDF(
    data: BitacoraEmbarqueListResponseDto,
  ): Promise<Buffer> {
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
      doc.moveDown(0.15);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#666666')
        .text(data.postulante.email)
        .fillColor('#000000');
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(12).text('Bitácora de Embarque');
      doc.moveDown(0.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0A2240')
        .text(
          `Tiempo total de mar: ${this.formatearTiempoTotal(data.tiempoTotal)}`,
        )
        .fillColor('#000000');
      doc.moveDown(0.8);

      if (data.embarques.length === 0) {
        doc.font('Helvetica').fontSize(11).text('Sin embarques registrados.');
      } else {
        data.embarques.forEach((embarque) => {
          const fechaEmbarco = this.formatearFechaResumen(
            embarque.fechaEmbarco,
          );
          const fechaDesembarco = this.formatearFechaResumen(
            embarque.fechaDesembarco,
          );

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(`${embarque.nombreNave} — ${embarque.naviera}`);
          doc
            .font('Helvetica')
            .fontSize(10)
            .text(
              `Embarco: ${fechaEmbarco}    Desembarco: ${fechaDesembarco}    Duración: ${this.formatearDuracion(embarque.duracion)}`,
            );
          doc
            .font('Helvetica')
            .fontSize(10)
            .text(
              `Tipo de máquina: ${embarque.tipoMaquina}    Potencia: ${embarque.potenciaKW} KW`,
            );
          doc
            .font('Helvetica')
            .fontSize(10)
            .text(
              `Tipo de nave: ${embarque.tipoNave}    Rango: ${embarque.rango}    Bandera: ${embarque.bandera}`,
            );
          doc.moveDown(0.4);
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

  private formatearDuracion(d: DuracionResponseDto): string {
    const partes: string[] = [];
    if (d.anios > 0)
      partes.push(`${d.anios} ${d.anios === 1 ? 'año' : 'años'}`);
    if (d.meses > 0)
      partes.push(`${d.meses} ${d.meses === 1 ? 'mes' : 'meses'}`);
    if (partes.length === 0) {
      partes.push(`${d.dias} ${d.dias === 1 ? 'día' : 'días'}`);
    }
    return partes.join(' ');
  }

  private formatearTiempoTotal(t: TiempoTotalResponseDto): string {
    if (t.anios === 0 && t.meses === 0) return 'Sin tiempo de mar registrado';
    const partes: string[] = [];
    if (t.anios > 0)
      partes.push(`${t.anios} ${t.anios === 1 ? 'año' : 'años'}`);
    if (t.meses > 0)
      partes.push(`${t.meses} ${t.meses === 1 ? 'mes' : 'meses'}`);
    return partes.join(' ');
  }

  private normalizarNombreArchivo(nombreCompleto: string): string {
    return (
      nombreCompleto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_') || 'postulante'
    );
  }
}
