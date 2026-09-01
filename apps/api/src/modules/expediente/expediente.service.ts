import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  Tab,
  TabStopPosition,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CursosService } from '../cursos/cursos.service';
import { BitacoraEmbarqueService } from '../bitacora-embarque/bitacora-embarque.service';
import { CursosListResponseDto } from '../cursos/dto/curso-response.dto';
import { BitacoraEmbarqueListResponseDto } from '../bitacora-embarque/dto/embarque-response.dto';

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: 'CCCCCC',
};
const CELL_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
};

@Injectable()
export class ExpedienteService {
  private readonly logger = new Logger(ExpedienteService.name);

  constructor(
    private readonly cursosService: CursosService,
    private readonly bitacoraService: BitacoraEmbarqueService,
  ) {}

  async generarExpediente(
    postulanteId: string,
    formato: 'docx' | 'pdf',
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const [cursosData, bitacoraData] = await Promise.all([
      this.cursosService.listarCursosPorPostulante(postulanteId),
      this.bitacoraService.listarEmbarquesPorPostulante(postulanteId),
    ]);

    const slug = this.normalizarNombreArchivo(
      cursosData.postulante.nombreCompleto,
    );
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const fechaHoyArchivo = fechaHoy.replace(/-/g, '');

    if (formato === 'docx') {
      const buffer = await this.construirExpedienteDOCX(
        cursosData,
        bitacoraData,
        fechaHoy,
      );
      return {
        filename: `Expediente_${slug}_${fechaHoyArchivo}.docx`,
        buffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }

    const buffer = await this.construirExpedientePDF(
      cursosData,
      bitacoraData,
      fechaHoy,
    );
    return {
      filename: `Expediente_${slug}_${fechaHoyArchivo}.pdf`,
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

  // ─── DOCX ────────────────────────────────────────────────────────────────────

  private async construirExpedienteDOCX(
    cursosData: CursosListResponseDto,
    bitacoraData: BitacoraEmbarqueListResponseDto,
    fechaHoy: string,
  ): Promise<Buffer> {
    const escudo = this.leerEscudoAsociacion();
    const ESCUDO_SIZE_DOCX = 70;

    const children: (Paragraph | Table)[] = [
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
        children: [
          new TextRun({
            text: 'REGISTRO No. 13 SECRETARIA DEL TRABAJO Y PREVISION SOCIAL',
            size: 18,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { after: 160 },
        children: [
          new TextRun({ text: 'F.T.I.T.M', size: 18, font: 'Times New Roman' }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({ text: 'I.T.F', size: 18, font: 'Times New Roman' }),
        ],
      }),
      new Paragraph({
        border: {
          bottom: { color: 'C9A24B', size: 12, style: BorderStyle.SINGLE },
        },
        spacing: { before: 80, after: 220 },
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: cursosData.postulante.nombreCompleto,
            bold: true,
            size: 28,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: `Fecha de generación: ${this.formatearFecha(fechaHoy)}`,
            size: 18,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 100, after: 160 },
        children: [
          new TextRun({
            text: 'Cursos y Certificaciones',
            bold: true,
            size: 24,
            color: '0A2240',
          }),
        ],
      }),
    ];

    children.push(this.construirTablaCursosDOCX(cursosData));

    children.push(
      new Paragraph({
        spacing: { before: 260, after: 160 },
        children: [
          new TextRun({
            text: 'Bitácora de Embarque',
            bold: true,
            size: 24,
            color: '0A2240',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 220 },
        children: [
          new TextRun({
            text: `Tiempo total de mar: ${this.formatearTiempoTotal(bitacoraData.tiempoTotal)}`,
            bold: true,
            size: 24,
            color: '0A2240',
          }),
        ],
      }),
    );

    if (bitacoraData.embarques.length === 0) {
      children.push(new Paragraph({ text: 'Sin embarques registrados.' }));
    } else {
      bitacoraData.embarques.forEach((embarque) => {
        const fechaEmbarco = this.formatearFecha(embarque.fechaEmbarco);
        const fechaDesembarco = this.formatearFecha(embarque.fechaDesembarco);
        const duracionMeses = this.duracionEnMeses(
          embarque.duracion.anios,
          embarque.duracion.meses,
        );

        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: embarque.nombreNave, bold: true, size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `Empresa naviera: ${embarque.naviera}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `Tipo de buque: ${embarque.tipoNave}    País: ${embarque.bandera}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `Cargo desempeñado: ${embarque.rango}`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: `${fechaEmbarco} → ${fechaDesembarco}    Duración: ${duracionMeses} meses`,
                size: 20,
              }),
            ],
          }),
        );
      });
    }

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBuffer(doc);
  }

  private construirTablaCursosDOCX(data: CursosListResponseDto): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        '#',
        'Curso / Certificación',
        'Fecha Inicio',
        'Fecha Vencimiento',
      ].map(
        (texto) =>
          new TableCell({
            borders: CELL_BORDERS,
            shading: { fill: '0A2240' },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: texto,
                    bold: true,
                    color: 'FFFFFF',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
      ),
    });

    if (data.cursos.length === 0) {
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow,
          new TableRow({
            children: [
              new TableCell({
                borders: CELL_BORDERS,
                columnSpan: 4,
                children: [new Paragraph({ text: 'Sin cursos registrados.' })],
              }),
            ],
          }),
        ],
      });
    }

    const filas = data.cursos.map((curso, i) => {
      const fechaInicio = this.formatearFecha(
        curso.fechaInicio ?? curso.fechaCurso,
      );
      const fechaVencimiento = curso.fechaVencimiento
        ? this.formatearFecha(curso.fechaVencimiento)
        : 'No especificada';
      return new TableRow({
        children: [
          String(i + 1),
          curso.nombreCurso,
          fechaInicio,
          fechaVencimiento,
        ].map(
          (texto) =>
            new TableCell({
              borders: CELL_BORDERS,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: texto, size: 20 })],
                }),
              ],
            }),
        ),
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...filas],
    });
  }

  // ─── PDF ─────────────────────────────────────────────────────────────────────

  private construirExpedientePDF(
    cursosData: CursosListResponseDto,
    bitacoraData: BitacoraEmbarqueListResponseDto,
    fechaHoy: string,
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
        .text(cursosData.postulante.nombreCompleto);
      doc.moveDown(0.15);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666666')
        .text(`Fecha de generación: ${this.formatearFecha(fechaHoy)}`)
        .fillColor('#000000');
      doc.moveDown(0.8);

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#0A2240')
        .text('Cursos y Certificaciones')
        .fillColor('#000000');
      doc.moveDown(0.5);
      this.dibujarTablaCursosPDF(doc, cursosData);

      // dibujarTablaCursosPDF deja doc.x en la última columna de la tabla
      // (cada celda se dibuja con un x explícito). Sin este reset, el
      // título y las líneas siguientes heredan ese x y salen corridas a la
      // derecha con el ancho de wrap achicado.
      doc.x = doc.page.margins.left;
      doc.moveDown(1);
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#0A2240')
        .text('Bitácora de Embarque')
        .fillColor('#000000');
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0A2240')
        .text(
          `Tiempo total de mar: ${this.formatearTiempoTotal(bitacoraData.tiempoTotal)}`,
        )
        .fillColor('#000000');
      doc.moveDown(0.6);

      this.dibujarTablaBitacoraPDF(doc, bitacoraData);

      doc.end();
    });
  }

  private dibujarTablaCursosPDF(
    doc: PDFKit.PDFDocument,
    data: CursosListResponseDto,
  ): void {
    const startX = 50;
    const colWidths = [30, 250, 90, 100];
    const headers = [
      '#',
      'Curso / Certificación',
      'Fecha Inicio',
      'Fecha Vencimiento',
    ];

    const dibujarFila = (
      valores: string[],
      opts: { bold?: boolean; bg?: string; color?: string } = {},
    ) => {
      const y = doc.y;
      const rowHeight = 20;
      if (opts.bg) {
        doc
          .rect(
            startX,
            y,
            colWidths.reduce((a, b) => a + b, 0),
            rowHeight,
          )
          .fill(opts.bg);
      }
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.fillColor(opts.color ?? '#000000');
      let x = startX;
      valores.forEach((valor, i) => {
        doc.text(valor, x + 4, y + 5, {
          width: colWidths[i] - 8,
          ellipsis: true,
        });
        x += colWidths[i];
      });
      doc.fillColor('#000000');
      doc.y = y + rowHeight;
    };

    if (doc.y > doc.page.height - 150) doc.addPage();
    dibujarFila(headers, { bold: true, bg: '#0A2240', color: '#FFFFFF' });

    if (data.cursos.length === 0) {
      dibujarFila(['', 'Sin cursos registrados.', '', '']);
      return;
    }

    data.cursos.forEach((curso, i) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const fechaInicio = this.formatearFecha(
        curso.fechaInicio ?? curso.fechaCurso,
      );
      const fechaVencimiento = curso.fechaVencimiento
        ? this.formatearFecha(curso.fechaVencimiento)
        : 'No especificada';
      dibujarFila([
        String(i + 1),
        curso.nombreCurso,
        fechaInicio,
        fechaVencimiento,
      ]);
    });
  }

  private dibujarTablaBitacoraPDF(
    doc: PDFKit.PDFDocument,
    data: BitacoraEmbarqueListResponseDto,
  ): void {
    const startX = 50;
    const colWidths = [22, 85, 78, 78, 78, 92, 55];
    const headers = [
      '#',
      'Buque',
      'Empresa',
      'Tipo / País',
      'Cargo',
      'Fechas',
      'Duración',
    ];
    const rowHeight = 20;
    // Margen inferior real de la página + un colchón extra para que ninguna
    // fila quede pegada al borde ni el membrete de una página siguiente la tape.
    const bottomLimit = () =>
      doc.page.height - doc.page.margins.bottom - rowHeight - 10;

    const dibujarFila = (
      valores: string[],
      opts: { bold?: boolean; bg?: string; color?: string } = {},
    ) => {
      const y = doc.y;
      if (opts.bg) {
        doc
          .rect(
            startX,
            y,
            colWidths.reduce((a, b) => a + b, 0),
            rowHeight,
          )
          .fill(opts.bg);
      }
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.fillColor(opts.color ?? '#000000');
      let x = startX;
      valores.forEach((valor, i) => {
        doc.text(valor, x + 4, y + 5, {
          width: colWidths[i] - 8,
          // height acotado a una sola línea: sin esto, ellipsis no trunca
          // nada (solo actúa cuando el texto no entra en el height dado) y
          // el texto largo wrapea a 2 líneas, pisando la fila siguiente.
          height: 11,
          ellipsis: true,
          lineBreak: false,
        });
        x += colWidths[i];
      });
      doc.fillColor('#000000');
      doc.y = y + rowHeight;
    };

    if (doc.y > bottomLimit()) doc.addPage();
    dibujarFila(headers, { bold: true, bg: '#0A2240', color: '#FFFFFF' });

    if (data.embarques.length === 0) {
      dibujarFila(['', 'Sin embarques registrados.', '', '', '', '', '']);
      return;
    }

    data.embarques.forEach((embarque, i) => {
      // Salto de página ANTES de dibujar la fila si no entra completa —
      // nunca a mitad de fila.
      if (doc.y > bottomLimit()) doc.addPage();

      const fechaEmbarco = this.formatearFecha(embarque.fechaEmbarco);
      const fechaDesembarco = this.formatearFecha(embarque.fechaDesembarco);
      const duracionMeses = this.duracionEnMeses(
        embarque.duracion.anios,
        embarque.duracion.meses,
      );

      dibujarFila(
        [
          String(i + 1),
          embarque.nombreNave,
          embarque.naviera,
          `${embarque.tipoNave} / ${embarque.bandera}`,
          embarque.rango,
          // Guión ASCII, no flecha unicode: las fuentes estándar de pdfkit
          // (Helvetica) no tienen ese glifo y lo renderizan roto.
          `${fechaEmbarco} - ${fechaDesembarco}`,
          `${duracionMeses} meses`,
        ],
        // Filas alternas para legibilidad, igual criterio visual que el
        // header de la tabla de cursos (mismo navy, aquí como acento suave).
        i % 2 === 1 ? { bg: '#EEF1F6' } : {},
      );
    });
  }

  // ─── Helpers compartidos ───────────────────────────────────────────────────

  private duracionEnMeses(anios: number, meses: number): number {
    return anios * 12 + meses;
  }

  private formatearFecha(fecha: string): string {
    const [fechaIso] = fecha.split('T');
    const [anio, mes, dia] = fechaIso.split('-');
    if (!anio || !mes || !dia) return fecha;
    return `${dia}/${mes}/${anio}`;
  }

  private formatearTiempoTotal(t: { anios: number; meses: number }): string {
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
