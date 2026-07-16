import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { LoggerService } from '../../common/logger';

const FROM_DEFAULT = 'ASOMMMN <onboarding@resend.dev>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);
  private resend: Resend | null = null;
  private from = FROM_DEFAULT;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const apiKey = this.config.get<string>('RESEND_API_KEY', '').trim();

    if (!apiKey) {
      this.resend = null;
      this.logger.error(
        'RESEND_API_KEY no configurada. El envío de correos NO funcionará hasta que se configure esta variable en el .env.',
      );
      return;
    }

    this.resend = new Resend(apiKey);

    LoggerService.mail({
      detalle: `Resend configurado · from=${this.from}`,
    });
  }

  private async send(options: EmailOptions) {
    if (!this.resend) {
      this.logger.warn(
        `[SIN RESEND] Para: ${options.to} | Asunto: ${options.subject}`,
      );
      return;
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        this.logger.error(
          `Error de Resend enviando correo a ${options.to}: ${error.name} — ${error.message}`,
        );
        return;
      }

      this.logger.log(`Correo enviado a ${options.to} (id: ${data?.id})`);
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
    this.logger.log(`[VERIFICACIÓN] ${email} → ${verifyUrl}`);
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

  async enviarPasswordTemporalEmail(
    email: string,
    nombre: string,
    passwordTemporal: string,
  ) {
    this.logger.log(`[CONTRASEÑA TEMPORAL] ${email}`);
    await this.send({
      to: email,
      subject: 'Contraseña temporal — ASOMMMN',
      html: `
        <h2>Hola, ${nombre}</h2>
        <p>Recibimos una solicitud para recuperar el acceso a tu cuenta.</p>
        <p>Tu nueva contraseña temporal es:</p>
        <p style="font-size:1.3em;font-weight:bold;letter-spacing:1px;background:#f4f4f4;padding:10px 16px;border-radius:5px;display:inline-block;">${passwordTemporal}</p>
        <p>Por seguridad, es <strong>temporal</strong>: al iniciar sesión con ella se te pedirá que la cambies de inmediato.</p>
        <p>Si no solicitaste esto, contacta al administrador del sistema.</p>
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
