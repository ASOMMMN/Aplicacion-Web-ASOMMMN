/**
 * Topes por usuario (UserThrottlerGuard) de los endpoints que cuestan IA o
 * almacenamiento. Guards de JWT/rol sustituidos; servicios simulados; el
 * throttler es el real. Cada prueba arma una app nueva: el contador es
 * en memoria, así que empieza en cero.
 */
import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  crearAppDeSubida,
  subirArchivo,
  throttlerDePrueba,
  type UsuarioPrueba,
} from '../../../test/utils/app-subida';
import { ChatbotController } from '../../modules/chatbot/chatbot.controller';
import { ChatbotService } from '../../modules/chatbot/chatbot.service';
import { CursosController } from '../../modules/cursos/cursos.controller';
import { CursosService } from '../../modules/cursos/cursos.service';
import { DocumentosController } from '../../modules/documentos/documentos.controller';
import { DocumentosService } from '../../modules/documentos/documentos.service';
import { IngestIaController } from '../../modules/ingest-ia/ingest-ia.controller';
import { IngestIaService } from '../../modules/ingest-ia/ingest-ia.service';

type Peticion = (app: INestApplication) => request.Test;

const post = (app: INestApplication, ruta: string) =>
  request(app.getHttpServer() as Parameters<typeof request>[0]).post(ruta);

interface Caso {
  nombre: string;
  limite: number;
  controlador: Parameters<typeof crearAppDeSubida>[0];
  servicio: Parameters<typeof crearAppDeSubida>[1];
  rol: string;
  peticion: Peticion;
  /** Texto esperado en el 429 (fragmento). */
  mensaje: string;
}

const CASOS: Caso[] = [
  {
    nombre: 'POST /cursos/extraer-ia',
    limite: 30,
    controlador: CursosController,
    servicio: {
      provide: CursosService,
      useValue: { extraerDatosCursoIa: jest.fn().mockResolvedValue({}) },
    },
    rol: 'postulante',
    peticion: (app) => subirArchivo(app, '/cursos/extraer-ia', 'archivo', 1024),
    mensaje: 'límite de análisis con IA',
  },
  {
    nombre: 'POST /documentos/subir',
    limite: 20,
    controlador: DocumentosController,
    servicio: {
      provide: DocumentosService,
      useValue: { subirCV: jest.fn().mockResolvedValue({ _id: 'x' }) },
    },
    rol: 'postulante',
    peticion: (app) => subirArchivo(app, '/documentos/subir', 'archivo', 1024),
    mensaje: 'demasiados CV',
  },
  {
    nombre: 'POST /ingest-ia/procesar/:postulanteId',
    limite: 60,
    controlador: IngestIaController,
    servicio: {
      provide: IngestIaService,
      useValue: { procesar: jest.fn().mockResolvedValue({}) },
    },
    rol: 'evaluador',
    peticion: (app) =>
      post(app, `/ingest-ia/procesar/${new Types.ObjectId().toString()}`),
    mensaje: 'límite de análisis con IA',
  },
  {
    nombre: 'POST /chatbot/mensaje',
    limite: 30,
    controlador: ChatbotController,
    servicio: {
      provide: ChatbotService,
      useValue: { enviarMensaje: jest.fn().mockResolvedValue({}) },
    },
    rol: 'postulante',
    peticion: (app) => post(app, '/chatbot/mensaje').send({ mensaje: 'hola' }),
    mensaje: 'mensajes muy rápido',
  },
];

describe.each(CASOS)('$nombre — tope por usuario', (caso) => {
  let app: INestApplication;
  let usuario: UsuarioPrueba;

  beforeEach(async () => {
    usuario = {
      userId: new Types.ObjectId().toString(),
      email: 'sintetico@asommmn.dev',
      rol: caso.rol,
    };
    app = await crearAppDeSubida(caso.controlador, caso.servicio, usuario, [
      throttlerDePrueba(),
    ]);
  });
  afterEach(() => app.close());

  it(`deja pasar ${caso.limite} peticiones y responde 429 a la siguiente`, async () => {
    for (let i = 0; i < caso.limite; i++) {
      const res = await caso.peticion(app);
      expect(res.status).not.toBe(429);
    }
    const res = await caso.peticion(app);
    expect(res.status).toBe(429);
    expect((res.body as { message: string }).message).toContain(caso.mensaje);
  }, 60_000);

  it('el tope es por usuario: otro usuario no se ve afectado', async () => {
    for (let i = 0; i < caso.limite; i++) await caso.peticion(app);
    expect((await caso.peticion(app)).status).toBe(429);

    usuario.userId = new Types.ObjectId().toString(); // otro usuario, misma IP
    expect((await caso.peticion(app)).status).not.toBe(429);
  }, 60_000);
});
