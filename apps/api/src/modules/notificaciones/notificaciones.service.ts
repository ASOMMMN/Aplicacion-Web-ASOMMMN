import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { LoggerService } from '../../common/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);
  private transporter: ReturnType<typeof nodemailer.createTransport> | null =
    null;
  private from = 'ASOMMMN';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const smtpHost = this.config.get<string>('SMTP_HOST', '').trim();
    const smtpUser = this.config.get<string>('SMTP_USER', '').trim();
    const smtpPass = this.config.get<string>('SMTP_PASS', '').trim();

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.transporter = null;
      this.logger.error(
        'SMTP_HOST / SMTP_USER / SMTP_PASS no configuradas. El envío de correos NO funcionará hasta que se configuren estas variables.',
      );
      return;
    }

    const smtpPort = this.config.get<number>('SMTP_PORT', 465);
    const smtpSecure =
      this.config.get<string>('SMTP_SECURE', 'true').trim() === 'true';
    const smtpFrom = this.config.get<string>('SMTP_FROM', '').trim() || smtpUser;

    this.from = `ASOMMMN <${smtpFrom}>`;
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    LoggerService.mail({
      detalle: `Gmail SMTP configurado · from=${this.from}`,
    });
  }

  private async send(options: EmailOptions) {
    if (!this.transporter) {
      this.logger.warn(
        `[SIN SMTP] Para: ${options.to} | Asunto: ${options.subject}`,
      );
      return;
    }
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      this.logger.log(`Correo enviado a ${options.to} (id: ${info.messageId})`);
    } catch (err) {
      this.logger.error(
        `Error enviando correo a ${options.to}: ${(err as Error).message}`,
      );
    }
  }

  async enviarVerificacionEmail(
    email: string,
    nombre: string,
    verifyUrl: string,
  ) {
    this.logger.log(`[VERIFICACIÓN] enviando correo a ${email}`);
    await this.send({
      to: email,
      subject: 'Verifica tu correo — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Confirma tu cuenta haciendo clic en el siguiente enlace:</p>
        <p><a href="${verifyUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Verificar correo</a></p>
        <p>El enlace expira en <strong>24 horas</strong>.</p>
        <p>Si no creaste esta cuenta, ignora este mensaje.</p>
      `,
    });
  }

  async enviarResetPasswordEmail(
    email: string,
    nombre: string,
    resetUrl: string,
  ) {
    this.logger.log(`[RESET CONTRASEÑA] enviando correo a ${email}`);
    await this.send({
      to: email,
      subject: 'Restablece tu contraseña — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p><a href="${resetUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Restablecer contraseña</a></p>
        <p>El enlace expira en <strong>1 hora</strong>.</p>
        <p>Si no solicitaste esto, ignora este mensaje.</p>
      `,
    });
  }

  async enviarBienvenidaEvaluador(
    email: string,
    nombre: string,
    tempPassword: string,
  ) {
    this.logger.log(`[BIENVENIDA EVALUADOR] ${email}`);
    await this.send({
      to: email,
      subject: 'Bienvenido al sistema ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Tu cuenta de evaluador ha sido creada.</p>
        <p><strong>Correo:</strong> ${email}<br>
           <strong>Contraseña temporal:</strong> ${tempPassword}</p>
        <p>Cambia tu contraseña en tu primer inicio de sesión.</p>
      `,
    });
  }

  async enviarNotificacionCambioEstado(
    email: string,
    nombre: string,
    estadoNuevo: 'en_proceso' | 'completado' | 'rechazado',
  ) {
    const etiquetas: Record<string, string> = {
      en_proceso: 'En proceso',
      completado: 'Completado',
      rechazado: 'Rechazado',
    };
    const colores: Record<string, string> = {
      en_proceso: '#856404',
      completado: '#155724',
      rechazado: '#721c24',
    };
    const etiqueta = etiquetas[estadoNuevo] ?? estadoNuevo;
    const color = colores[estadoNuevo] ?? '#333';

    this.logger.log(`[CAMBIO ESTADO] ${email} → ${estadoNuevo}`);
    await this.send({
      to: email,
      subject: `Actualización de tu postulación — ASOMMMN`,
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>El estado de tu postulación ha sido actualizado:</p>
        <p style="font-size:1.2em;font-weight:bold;color:${color};">${etiqueta}</p>
        <p>Ingresa a tu portal para ver los comentarios del evaluador.</p>
        <p style="color:#666;font-size:0.9em;">Si tienes dudas, contacta al administrador del sistema.</p>
      `,
    });
  }

  async enviarRecordatorioDocumentosPendientes(
    email: string,
    nombre: string,
    faltantes: string[],
  ) {
    this.logger.log(`[RECORDATORIO EXPEDIENTE] ${email} (${faltantes.length} pendientes)`);
    await this.send({
      to: email,
      subject: 'Recordatorio: documentos pendientes de tu expediente — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Tu expediente todavía no está completo. Te faltan los siguientes requisitos:</p>
        <ul>${faltantes.map((f) => `<li>${f}</li>`).join('')}</ul>
        <p>Ingresa a tu portal para completarlos y enviar tu postulación.</p>
        <p style="color:#666;font-size:0.9em;">Recibirás este recordatorio cada semana hasta que tu expediente esté al 100%.</p>
      `,
    });
  }

  async enviarConfirmacionExpedienteEnviado(email: string, nombre: string) {
    this.logger.log(`[EXPEDIENTE ENVIADO] ${email}`);
    await this.send({
      to: email,
      subject: 'Recibimos tu expediente — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Confirmamos que tu expediente fue recibido correctamente.</p>
        <p>Un evaluador lo revisará próximamente y podrás ver los comentarios en tu portal.</p>
      `,
    });
  }

  async enviarAvisoComentarioNuevo(email: string, nombre: string, estadoUrl: string) {
    this.logger.log(`[COMENTARIO NUEVO] ${email}`);
    await this.send({
      to: email,
      subject: 'Tienes un comentario nuevo del evaluador — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Un evaluador agregó un comentario nuevo en tu expediente.</p>
        <p><a href="${estadoUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Ver comentario</a></p>
      `,
    });
  }

  async enviarNuevoCandidatoRegistrado(
    email: string,
    nombreEvaluador: string,
    nombreCandidato: string,
    candidatosUrl: string,
  ) {
    this.logger.log(`[NUEVO CANDIDATO] aviso a ${email}`);
    await this.send({
      to: email,
      subject: 'Nuevo candidato registrado — ASOMMMN',
      html: `
        <h2>Hola, ${nombreEvaluador}</h2>
        <p><strong>${nombreCandidato}</strong> se acaba de registrar como postulante.</p>
        <p><a href="${candidatosUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Ver candidatos</a></p>
      `,
    });
  }

  async enviarExpedienteListoRevisar(
    email: string,
    nombreEvaluador: string,
    nombreCandidato: string,
    candidatoUrl: string,
  ) {
    this.logger.log(`[EXPEDIENTE 100%] aviso a ${email}`);
    await this.send({
      to: email,
      subject: 'Expediente listo para revisar — ASOMMMN',
      html: `
        <h2>Hola, ${nombreEvaluador}</h2>
        <p><strong>${nombreCandidato}</strong> completó y envió su expediente (100%).</p>
        <p><a href="${candidatoUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Ver ficha del candidato</a></p>
      `,
    });
  }
}
