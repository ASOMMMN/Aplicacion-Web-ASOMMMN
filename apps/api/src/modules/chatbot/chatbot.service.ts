import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';

import {
  ChatConversacion,
  ChatConversacionDocument,
  Mensaje,
} from './schemas/chat-conversacion.schema';
import {
  ConversacionItemDto,
  EliminarConversacionResponseDto,
  EnviarMensajeResponseDto,
  HistorialResponseDto,
  ListarConversacionesResponseDto,
  NuevaConversacionResponseDto,
} from './dto/chatbot.dto';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';

/** Respuestas consecutivas sin resolver antes de ofrecer WhatsApp. */
export const MAX_INTENTOS_SIN_RESOLVER = 3;

/** Número máximo de mensajes del historial enviados a OpenAI para contexto. */
const MAX_HISTORIAL_OPENAI = 10;

interface OpenAiChatbotResponse {
  respuesta: string;
  resuelto: boolean;
}

@Injectable()
export class ChatbotService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private knowledgeBase = '';

  constructor(
    @InjectModel(ChatConversacion.name)
    private readonly conversacionModel: Model<ChatConversacionDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
    });
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
  }

  /** Carga el manual una sola vez en memoria al iniciar el módulo. */
  onModuleInit(): void {
    const kbPath = join(
      process.cwd(),
      'src',
      'modules',
      'chatbot',
      'knowledge-base.md',
    );
    try {
      this.knowledgeBase = readFileSync(kbPath, 'utf-8');
      this.logger.log(
        `knowledge-base.md cargado (${this.knowledgeBase.length} caracteres)`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`No se pudo cargar knowledge-base.md: ${msg}`);
    }
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────

  async enviarMensaje(
    userId: string,
    mensajeTexto: string,
  ): Promise<EnviarMensajeResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    // Buscar o crear conversación activa
    let conversacion = await this.conversacionModel.findOne({
      postulanteId,
      activa: true,
    });
    if (!conversacion) {
      conversacion = await this.conversacionModel.create({
        postulanteId,
        mensajes: [],
        intentosSinResolver: 0,
        whatsappOfrecido: false,
      });
    }

    // Construir mensajes para OpenAI (historial reciente + nuevo mensaje)
    const historialOpenAI = this.construirHistorialOpenAI(
      conversacion.mensajes,
      mensajeTexto,
    );

    // Llamar a OpenAI
    const respuestaIA = await this.llamarOpenAI(historialOpenAI);

    // Registrar mensaje del usuario y respuesta del asistente
    const ahora = new Date();

    const msgUsuario: Mensaje = {
      rol: 'usuario',
      contenido: mensajeTexto,
      creadoEn: ahora,
    };

    const msgAsistente: Mensaje = {
      rol: 'asistente',
      contenido: respuestaIA.respuesta,
      resuelto: respuestaIA.resuelto,
      creadoEn: new Date(),
    };

    conversacion.mensajes.push(msgUsuario, msgAsistente);

    // Actualizar contador de intentos sin resolver
    if (respuestaIA.resuelto) {
      conversacion.intentosSinResolver = 0;
    } else {
      conversacion.intentosSinResolver += 1;
    }

    // Marcar whatsappOfrecido cuando se alcanza el límite
    if (conversacion.intentosSinResolver >= MAX_INTENTOS_SIN_RESOLVER) {
      conversacion.whatsappOfrecido = true;
    }

    await conversacion.save();

    const numeroWhatsapp = this.configService.get<string>(
      'CHATBOT_WHATSAPP_NUMERO',
      '',
    );

    return {
      respuesta: respuestaIA.respuesta,
      mostrarWhatsapp: conversacion.whatsappOfrecido,
      numeroWhatsapp,
    };
  }

  // ── Obtener historial ──────────────────────────────────────────────────────

  async obtenerHistorial(userId: string): Promise<HistorialResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    const conversacion = await this.conversacionModel
      .findOne({ postulanteId, activa: true })
      .lean();

    const numeroWhatsapp = this.configService.get<string>(
      'CHATBOT_WHATSAPP_NUMERO',
      '',
    );

    if (!conversacion) {
      return {
        conversacionId: '',
        mensajes: [],
        intentosSinResolver: 0,
        whatsappOfrecido: false,
        numeroWhatsapp,
      };
    }

    return {
      conversacionId: conversacion._id.toString(),
      mensajes: conversacion.mensajes.map((m) => ({
        rol: m.rol,
        contenido: m.contenido,
        resuelto: m.resuelto,
        creadoEn: m.creadoEn,
      })),
      intentosSinResolver: conversacion.intentosSinResolver,
      whatsappOfrecido: conversacion.whatsappOfrecido,
      numeroWhatsapp,
    };
  }

  // ── Nueva conversación ─────────────────────────────────────────────────────

  async iniciarNuevaConversacion(
    userId: string,
  ): Promise<NuevaConversacionResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    // Archivar la conversación activa actual (si existe)
    await this.conversacionModel.updateOne(
      { postulanteId, activa: true },
      { $set: { activa: false } },
    );

    // Crear conversación nueva
    const nueva = await this.conversacionModel.create({
      postulanteId,
      mensajes: [],
      intentosSinResolver: 0,
      whatsappOfrecido: false,
      activa: true,
    });

    return { conversacionId: nueva._id.toString() };
  }

  // ── Listar conversaciones ──────────────────────────────────────────────────

  async listarConversaciones(
    userId: string,
  ): Promise<ListarConversacionesResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    const docs = await this.conversacionModel
      .find({ postulanteId })
      .sort({ creadoEn: -1 })
      .lean();

    const conversaciones: ConversacionItemDto[] = docs.map((c) => {
      const primerMsgUsuario = c.mensajes.find((m) => m.rol === 'usuario');
      const preview = primerMsgUsuario
        ? primerMsgUsuario.contenido.slice(0, 50)
        : 'Conversación nueva';
      const ultimoMsg = c.mensajes[c.mensajes.length - 1];
      return {
        id: c._id.toString(),
        preview,
        totalMensajes: c.mensajes.length,
        creadoEn: c.creadoEn,
        ultimoMensajeEn: ultimoMsg?.creadoEn,
        activa: c.activa ?? true,
      };
    });

    return { conversaciones };
  }

  // ── Seleccionar conversación ───────────────────────────────────────────────

  async seleccionarConversacion(
    userId: string,
    conversacionId: string,
  ): Promise<HistorialResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    if (!Types.ObjectId.isValid(conversacionId)) {
      throw new NotFoundException('Conversación no válida.');
    }

    const conv = await this.conversacionModel.findOne({
      _id: new Types.ObjectId(conversacionId),
      postulanteId,
    });
    if (!conv) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    // Desactivar la activa actual y activar la seleccionada
    await this.conversacionModel.updateOne(
      { postulanteId, activa: true },
      { $set: { activa: false } },
    );
    conv.activa = true;
    await conv.save();

    return {
      conversacionId: conv._id.toString(),
      mensajes: conv.mensajes.map((m) => ({
        rol: m.rol,
        contenido: m.contenido,
        resuelto: m.resuelto,
        creadoEn: m.creadoEn,
      })),
      intentosSinResolver: conv.intentosSinResolver,
      whatsappOfrecido: conv.whatsappOfrecido,
      numeroWhatsapp: this.configService.get<string>(
        'CHATBOT_WHATSAPP_NUMERO',
        '',
      ),
    };
  }

  // ── Eliminar conversación ──────────────────────────────────────────────────

  async eliminarConversacion(
    userId: string,
    conversacionId: string,
  ): Promise<EliminarConversacionResponseDto> {
    const postulante = await this.resolverPostulante(userId);
    const postulanteId = postulante._id;

    if (!Types.ObjectId.isValid(conversacionId)) {
      throw new NotFoundException('Conversación no válida.');
    }

    const conv = await this.conversacionModel.findOne({
      _id: new Types.ObjectId(conversacionId),
      postulanteId,
    });
    if (!conv) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    const eraActiva = conv.activa ?? true;
    await conv.deleteOne();

    if (!eraActiva) {
      return { eraActiva: false };
    }

    // Era la activa: crear conversación vacía nueva
    const nueva = await this.conversacionModel.create({
      postulanteId,
      mensajes: [],
      intentosSinResolver: 0,
      whatsappOfrecido: false,
      activa: true,
    });

    return {
      eraActiva: true,
      nuevoHistorial: {
        conversacionId: nueva._id.toString(),
        mensajes: [],
        intentosSinResolver: 0,
        whatsappOfrecido: false,
        numeroWhatsapp: this.configService.get<string>(
          'CHATBOT_WHATSAPP_NUMERO',
          '',
        ),
      },
    };
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  private async resolverPostulante(
    userId: string,
  ): Promise<PostulanteDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Usuario no válido.');
    }
    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });
    if (!postulante) {
      throw new NotFoundException(
        'No se encontró un perfil de postulante para este usuario.',
      );
    }
    return postulante;
  }

  private construirHistorialOpenAI(
    mensajes: Mensaje[],
    nuevoMensaje: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const systemPrompt = this.buildSystemPrompt();

    // Tomar los últimos MAX_HISTORIAL_OPENAI mensajes para no superar el contexto
    const recientes = mensajes.slice(-MAX_HISTORIAL_OPENAI);

    const historial: OpenAI.Chat.ChatCompletionMessageParam[] = recientes.map(
      (m) => ({
        role: m.rol === 'usuario' ? 'user' : 'assistant',
        content: m.contenido,
      }),
    );

    return [
      { role: 'system', content: systemPrompt },
      ...historial,
      { role: 'user', content: nuevoMensaje },
    ];
  }

  private buildSystemPrompt(): string {
    return `Eres el asistente virtual de ayuda del Portal del Postulante de la Escuela Náutica Mercante de Veracruz (ENMV) "Cap. Alt. Fernando Siliceo y Torres".
Tu única función es responder dudas relacionadas con el uso del portal de postulantes.

════════════════════════════════════════
BASE DE CONOCIMIENTO DEL PORTAL
════════════════════════════════════════
${this.knowledgeBase}
════════════════════════════════════════

INSTRUCCIONES ESTRICTAS:
1. Responde ÚNICAMENTE usando la información de la base de conocimiento anterior.
2. Si la pregunta NO está relacionada con el portal del postulante, responde amablemente que solo puedes ayudar con dudas del portal y sugiere contactar al soporte de la ENMV.
3. Si no encuentras la información en el manual, díselo al usuario en lugar de inventar.
4. NO inventes pasos, rutas, validaciones ni funciones que no estén en el manual.
5. Sé breve, claro y amable. Usa listas numeradas cuando expliques pasos.
6. Responde siempre en español.
7. Devuelve ÚNICAMENTE el siguiente JSON, sin markdown ni texto adicional:

{
  "respuesta": "<texto de la respuesta para el usuario>",
  "resuelto": <true si la duda quedó completamente resuelta, false si probablemente el usuario necesitará más ayuda>
}`;
  }

  private async llamarOpenAI(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): Promise<OpenAiChatbotResponse> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY no configurada — respondiendo con fallback',
      );
      return {
        respuesta:
          'El asistente no está disponible en este momento. Por favor contacta al equipo de soporte de la ENMV.',
        resuelto: false,
      };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages,
        temperature: 0.2,
        max_tokens: 600,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      this.logger.debug(`OpenAI chatbot response: ${raw.slice(0, 200)}`);

      const parsed = JSON.parse(raw) as Partial<OpenAiChatbotResponse>;
      return {
        respuesta:
          typeof parsed.respuesta === 'string' && parsed.respuesta.trim()
            ? parsed.respuesta.trim()
            : 'No pude generar una respuesta. Intenta reformular tu pregunta.',
        resuelto: parsed.resuelto === true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error al llamar a OpenAI: ${msg}`);
      return {
        respuesta:
          'Ocurrió un error al procesar tu consulta. Por favor intenta de nuevo en unos momentos.',
        resuelto: false,
      };
    }
  }
}
