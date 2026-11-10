import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { PassThrough, Readable, Writable } from 'node:stream';

import { ExpedienteZipService, PlanZip } from './expediente-zip.service';
import { ExpedienteController } from './expediente.controller';
import {
  CARPETA_CURSOS,
  CARPETA_CV,
  CARPETA_DOCS_PERSONALES,
  NombresUnicos,
  nombreArchivoZip,
  nombreCarpetaRaiz,
  sanearSegmento,
} from './expediente-zip.util';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// ─── Lector mínimo de ZIP (directorio central) para verificar la salida ────────

interface EntradaLeida {
  nombre: string;
  metodo: number;
  contenido: Buffer;
}

function leerZip(zip: Buffer): EntradaLeida[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('ZIP sin fin de directorio central');
  const total = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entradas: EntradaLeida[] = [];
  for (let i = 0; i < total; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const metodo = zip.readUInt16LE(p + 10);
    const tamComprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const offsetLocal = zip.readUInt32LE(p + 42);
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre);
    const inicioDatos =
      offsetLocal +
      30 +
      zip.readUInt16LE(offsetLocal + 26) +
      zip.readUInt16LE(offsetLocal + 28);
    entradas.push({
      nombre,
      metodo,
      contenido: zip.subarray(inicioDatos, inicioDatos + tamComprimido),
    });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

/** Response de Express mínima: un Writable que junta los bytes y guarda cabeceras. */
class RespuestaFalsa extends Writable {
  readonly cabeceras: Record<string, string> = {};
  readonly trozos: Buffer[] = [];
  codigo = 0;

  _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
    this.trozos.push(chunk);
    cb();
  }
  setHeader(nombre: string, valor: string) {
    this.cabeceras[nombre.toLowerCase()] = String(valor);
    return this;
  }
  status(codigo: number) {
    this.codigo = codigo;
    return this;
  }
  get cuerpo() {
    return Buffer.concat(this.trozos);
  }
}

// ─── Mocks de Mongoose ─────────────────────────────────────────────────────────

/** Imita `Model.find(...).sort(...).lean()` / `findOne(...).lean()` y guarda el filtro usado. */
function modeloFalso(resultado: unknown) {
  const llamadas: unknown[] = [];
  const consulta = (filtro: unknown) => {
    llamadas.push(filtro);
    const q = {
      sort: () => q,
      populate: () => q,
      lean: () => Promise.resolve(resultado),
    };
    return q;
  };
  return {
    llamadas,
    find: jest.fn(consulta),
    findOne: jest.fn(consulta),
    findById: jest.fn(consulta),
  };
}

const POSTULANTE_ID = new Types.ObjectId().toString();
const URL_S3 = (k: string) =>
  `https://bucket.s3.us-east-2.amazonaws.com/asommmn/${k}`;

function docPersonal(
  tipo: string,
  nombreOriginal: string,
  extra: Record<string, unknown> = {},
) {
  return {
    tipo,
    nombreOriginal,
    tipoMime: 'application/pdf',
    tamanio: 1000,
    storageType: 'cloudinary',
    cloudinaryUrl: URL_S3(`docs/${nombreOriginal}`),
    subidasEn: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

function crearServicio(opciones: {
  postulante?: unknown;
  docs?: unknown[];
  cursos?: unknown[];
  cv?: unknown;
  config?: Record<string, string>;
  storage?: { getObjectStream: jest.Mock };
}) {
  const postulanteModel = modeloFalso(
    'postulante' in opciones
      ? opciones.postulante
      : {
          _id: POSTULANTE_ID,
          usuarioId: { nombre: 'José Ángel', apellidos: 'Peña Núñez' },
        },
  );
  const docModel = modeloFalso(opciones.docs ?? []);
  const cursoModel = modeloFalso(opciones.cursos ?? []);
  const documentoModel = modeloFalso(opciones.cv ?? null);
  const storage = opciones.storage ?? {
    getObjectStream: jest.fn((url: string) =>
      Promise.resolve(Readable.from([Buffer.from(`contenido:${url}`)])),
    ),
  };
  const auditoria = { registrar: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => opciones.config?.[k] };
  const service = new ExpedienteZipService(
    postulanteModel as never,
    docModel as never,
    cursoModel as never,
    documentoModel as never,
    storage as never,
    auditoria as never,
    config as never,
  );
  return {
    service,
    storage,
    auditoria,
    postulanteModel,
    docModel,
    cursoModel,
    documentoModel,
  };
}

/** `metadata` de la (única) llamada a auditoria.registrar. */
function metadataAuditada(auditoria: { registrar: jest.Mock }) {
  const [entrada] = auditoria.registrar.mock.calls[0] as [
    { metadata: Record<string, unknown> },
  ];
  return entrada.metadata;
}

const ACTOR = {
  userId: new Types.ObjectId().toString(),
  email: 'evaluador@asommmn.mx',
  rol: 'evaluador' as const,
};

// ─── Utilidades de nombres ─────────────────────────────────────────────────────

describe('expediente-zip.util', () => {
  it('sanearSegmento quita acentos, ñ, separadores de ruta y caracteres reservados', () => {
    expect(sanearSegmento('Constancia de participación')).toBe(
      'Constancia_de_participacion',
    );
    expect(sanearSegmento('Peña Núñez')).toBe('Pena_Nunez');
    expect(sanearSegmento('../../etc/passwd')).toBe('etc_passwd');
    expect(sanearSegmento('a<b>c:d"e|f?g*h\\i')).toBe('a_b_c_d_e_f_g_h_i');
    expect(sanearSegmento('  ..  ')).toBe('');
    expect(sanearSegmento('x'.repeat(200)).length).toBe(80);
  });

  it('nombreArchivoZip pone el tipo al inicio, conserva la extensión y no repite el tipo', () => {
    expect(nombreArchivoZip('CURP', 'mi curp (2).PDF')).toBe(
      'CURP_mi_curp_2.pdf',
    );
    expect(nombreArchivoZip('CURP', 'CURP.pdf')).toBe('CURP.pdf');
    expect(
      nombreArchivoZip('Acta de nacimiento', 'acta_de_nacimiento_2020.pdf'),
    ).toBe('Acta_de_nacimiento_2020.pdf');
    expect(nombreArchivoZip('Pasaporte', 'foto', 'image/jpeg')).toBe(
      'Pasaporte_foto.jpg',
    );
    expect(nombreArchivoZip('Visa', '', 'application/pdf')).toBe('Visa.pdf');
    expect(nombreArchivoZip('INE', 'ine.exe/../x.pdf')).toBe(
      'INE_ine.exe_x.pdf',
    );
    expect(nombreArchivoZip('INE', 'ine frente.pdf')).toBe('INE_frente.pdf');
    expect(nombreArchivoZip('CURP', 'Documento CURP.pdf')).toBe(
      'CURP_Documento_CURP.pdf',
    );
  });

  it('NombresUnicos agrega sufijo numérico por carpeta, sin distinguir mayúsculas', () => {
    const n = new NombresUnicos();
    expect(n.reservar('a', 'CURP.pdf')).toBe('CURP.pdf');
    expect(n.reservar('a', 'curp.pdf')).toBe('curp_2.pdf');
    expect(n.reservar('a', 'CURP.pdf')).toBe('CURP_3.pdf');
    expect(n.reservar('b', 'CURP.pdf')).toBe('CURP.pdf');
  });

  it('nombreCarpetaRaiz es APELLIDOS_NOMBRES en mayúsculas, con respaldo si no hay nombre', () => {
    expect(nombreCarpetaRaiz('Peña Núñez', 'José Ángel', 'x')).toBe(
      'PENA_NUNEZ_JOSE_ANGEL',
    );
    expect(nombreCarpetaRaiz('', null, 'abc123')).toBe('POSTULANTE_abc123');
  });
});

// ─── Plan del ZIP ──────────────────────────────────────────────────────────────

describe('ExpedienteZipService.planificar', () => {
  it('arma las tres subcarpetas con nombres saneados, sin duplicados y en orden del catálogo', async () => {
    const { service } = crearServicio({
      docs: [
        docPersonal('INE', 'ine frente.pdf'),
        docPersonal('CURP', 'CURP.pdf'),
        docPersonal('CURP', 'curp.pdf'),
        docPersonal('constancia_participacion', 'constancia.pdf'),
      ],
      cursos: [
        {
          nombreCurso: 'Supervivencia en el mar',
          documentoExtra: {
            nombreOriginal: 'certificado.pdf',
            tipoMime: 'application/pdf',
            tamanio: 2000,
            storageType: 'cloudinary',
            cloudinaryUrl: URL_S3('cursos/certificado.pdf'),
            subidoEn: new Date(),
          },
        },
      ],
      cv: {
        version: 3,
        nombreOriginal: 'Mi CV.pdf',
        tipoMime: 'application/pdf',
        tamanio: 500,
        storageType: 'cloudinary',
        cloudinaryUrl: URL_S3('cv/micv.pdf'),
        subidasEn: new Date(),
      },
    });

    const plan = await service.planificar(POSTULANTE_ID);

    expect(plan.carpetaRaiz).toBe('PENA_NUNEZ_JOSE_ANGEL');
    expect(plan.nombreZip).toMatch(
      /^Documentos_PENA_NUNEZ_JOSE_ANGEL_\d{8}\.zip$/,
    );
    expect(plan.entradas.map((e) => e.ruta)).toEqual([
      `${CARPETA_DOCS_PERSONALES}/CURP.pdf`,
      `${CARPETA_DOCS_PERSONALES}/CURP_2.pdf`,
      `${CARPETA_DOCS_PERSONALES}/INE_frente.pdf`,
      `${CARPETA_DOCS_PERSONALES}/Constancia_de_participacion_constancia.pdf`,
      `${CARPETA_CURSOS}/Supervivencia_en_el_mar_certificado.pdf`,
      `${CARPETA_CV}/CV_v3_Mi_CV.pdf`,
    ]);
    expect(plan.bytesEstimados).toBe(4000 + 2000 + 500);
    expect(plan.noDisponibles).toEqual([]);
  });

  it('filtra todas las consultas por el postulante pedido (sin IDOR) y solo toma el CV actual', async () => {
    const { service, docModel, cursoModel, documentoModel } = crearServicio({
      docs: [docPersonal('CURP', 'CURP.pdf')],
    });
    await service.planificar(POSTULANTE_ID);

    const id = (f: unknown) =>
      String((f as { postulanteId: Types.ObjectId }).postulanteId);
    expect(id(docModel.llamadas[0])).toBe(POSTULANTE_ID);
    expect(id(cursoModel.llamadas[0])).toBe(POSTULANTE_ID);
    expect(id(documentoModel.llamadas[0])).toBe(POSTULANTE_ID);
    expect(documentoModel.llamadas[0]).toMatchObject({ esActual: true });
  });

  it('los archivos de almacenamiento anterior quedan como no disponibles (van al LEEME)', async () => {
    const { service } = crearServicio({
      docs: [
        docPersonal('CURP', 'CURP.pdf'),
        docPersonal('INE', 'ine.pdf', {
          storageType: 'local',
          cloudinaryUrl: undefined,
        }),
      ],
    });
    const plan = await service.planificar(POSTULANTE_ID);
    expect(plan.entradas).toHaveLength(1);
    expect(plan.noDisponibles).toEqual([
      expect.objectContaining({ ruta: `${CARPETA_DOCS_PERSONALES}/INE.pdf` }),
    ]);
  });

  it('404 si el postulante no existe', async () => {
    const { service } = crearServicio({ postulante: null });
    await expect(service.planificar(POSTULANTE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404 con mensaje claro si no hay documentos subidos (los pendientes por subir no cuentan)', async () => {
    const { service } = crearServicio({});
    await expect(service.planificar(POSTULANTE_ID)).rejects.toThrow(
      'Este aspirante todavía no tiene documentos para descargar.',
    );
  });

  it('422 con mensaje claro si supera el límite de tamaño', async () => {
    const { service } = crearServicio({
      docs: [docPersonal('CURP', 'CURP.pdf', { tamanio: 2 * 1024 * 1024 })],
      config: { EXPEDIENTE_ZIP_MAX_MB: '1' },
    });
    const error = await service
      .planificar(POSTULANTE_ID)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as Error).message).toMatch(
      /demasiado grande.*2\.0 MB.*máximo 1 MB/,
    );
  });
});

// ─── Streaming del ZIP ─────────────────────────────────────────────────────────

describe('ExpedienteZipService.transmitir', () => {
  const plan = (
    entradas: PlanZip['entradas'],
    extra: Partial<PlanZip> = {},
  ): PlanZip => ({
    postulanteId: POSTULANTE_ID,
    nombreAspirante: 'José Peña',
    carpetaRaiz: 'PENA_JOSE',
    nombreZip: 'Documentos_PENA_JOSE_20261109.zip',
    entradas,
    noDisponibles: [],
    bytesEstimados: 10,
    ...extra,
  });
  const entrada = (ruta: string) => ({ ruta, url: URL_S3(ruta), tamanio: 5 });

  it('escribe la estructura de carpetas sin compresión, con cabeceras correctas y auditoría', async () => {
    const { service, auditoria } = crearServicio({});
    const res = new RespuestaFalsa();

    const resultado = await service.transmitir(
      plan([
        entrada(`${CARPETA_DOCS_PERSONALES}/CURP.pdf`),
        entrada(`${CARPETA_CV}/CV_v1.pdf`),
      ]),
      res as never,
      ACTOR,
      '10.0.0.1',
    );

    expect(resultado).toBe('completado');
    expect(res.cabeceras['content-type']).toBe('application/zip');
    expect(res.cabeceras['content-disposition']).toContain(
      'attachment; filename="Documentos_PENA_JOSE_20261109.zip"',
    );
    expect(res.cabeceras['cache-control']).toContain('no-store');

    const zip = leerZip(res.cuerpo);
    expect(zip.map((e) => e.nombre)).toEqual([
      `PENA_JOSE/${CARPETA_DOCS_PERSONALES}/CURP.pdf`,
      `PENA_JOSE/${CARPETA_CV}/CV_v1.pdf`,
    ]);
    expect(zip.every((e) => e.metodo === 0)).toBe(true); // store = nivel 0
    expect(zip[0].contenido.toString()).toBe(
      `contenido:${URL_S3(`${CARPETA_DOCS_PERSONALES}/CURP.pdf`)}`,
    );
    // Nunca se exponen URLs de S3 en cabeceras.
    expect(JSON.stringify(res.cabeceras)).not.toContain('amazonaws');

    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR.userId,
        actorEmail: ACTOR.email,
        accion: 'expediente_zip_descargado',
        recurso: 'Postulante',
        recursoId: POSTULANTE_ID,
        ipAddress: '10.0.0.1',
      }),
    );
    expect(metadataAuditada(auditoria)).toMatchObject({
      resultado: 'completado',
      archivosIncluidos: 2,
      archivosNoIncluidos: 0,
    });
  });

  it('si un archivo falta en S3 sigue con los demás y agrega LEEME.txt con lo omitido', async () => {
    const storage = {
      getObjectStream: jest.fn((url: string) =>
        url.includes('INE')
          ? Promise.reject(new NotFoundException('no está'))
          : Promise.resolve(Readable.from([Buffer.from('ok')])),
      ),
    };
    const { service, auditoria } = crearServicio({ storage });
    const res = new RespuestaFalsa();

    const resultado = await service.transmitir(
      plan(
        [
          entrada(`${CARPETA_DOCS_PERSONALES}/CURP.pdf`),
          entrada(`${CARPETA_DOCS_PERSONALES}/INE.pdf`),
          entrada(`${CARPETA_CV}/CV_v1.pdf`),
        ],
        {
          noDisponibles: [
            {
              ruta: `${CARPETA_CURSOS}/Viejo.pdf`,
              motivo: 'almacenamiento anterior',
            },
          ],
        },
      ),
      res as never,
      ACTOR,
    );

    expect(resultado).toBe('completado');
    const zip = leerZip(res.cuerpo);
    expect(zip.map((e) => e.nombre)).toEqual([
      `PENA_JOSE/${CARPETA_DOCS_PERSONALES}/CURP.pdf`,
      `PENA_JOSE/${CARPETA_CV}/CV_v1.pdf`,
      'PENA_JOSE/LEEME.txt',
    ]);
    const leeme = zip[2].contenido.toString('utf8');
    expect(leeme.charCodeAt(0)).toBe(0xfeff); // BOM para el Bloc de notas
    expect(leeme).toContain(`${CARPETA_DOCS_PERSONALES}/INE.pdf`);
    expect(leeme).toContain(`${CARPETA_CURSOS}/Viejo.pdf`);
    expect(leeme).toContain('Total no incluidos: 2');
    expect(metadataAuditada(auditoria)).toMatchObject({
      archivosIncluidos: 2,
      archivosNoIncluidos: 2,
    });
  });

  it('si S3 no responde a tiempo, omite el archivo y continúa', async () => {
    const storage = {
      getObjectStream: jest.fn((url: string) =>
        url.includes('lento')
          ? new Promise<Readable>(() => undefined)
          : Promise.resolve(Readable.from([Buffer.from('ok')])),
      ),
    };
    const { service } = crearServicio({
      storage,
      config: { EXPEDIENTE_ZIP_TIMEOUT_APERTURA_MS: '20' },
    });
    const res = new RespuestaFalsa();
    await service.transmitir(
      plan([
        entrada(`${CARPETA_CV}/lento.pdf`),
        entrada(`${CARPETA_CV}/CV.pdf`),
      ]),
      res as never,
      ACTOR,
    );
    const nombres = leerZip(res.cuerpo).map((e) => e.nombre);
    expect(nombres).toEqual([
      `PENA_JOSE/${CARPETA_CV}/CV.pdf`,
      'PENA_JOSE/LEEME.txt',
    ]);
  });

  it('si el cliente cancela, destruye el stream de S3 y registra "cancelado"', async () => {
    const fuente = new PassThrough();
    fuente.write(Buffer.alloc(1024));
    const storage = { getObjectStream: jest.fn().mockResolvedValue(fuente) };
    const { service, auditoria } = crearServicio({ storage });
    const res = new RespuestaFalsa();

    const promesa = service.transmitir(
      plan([
        entrada(`${CARPETA_CV}/CV.pdf`),
        entrada(`${CARPETA_CV}/otro.pdf`),
      ]),
      res as never,
      ACTOR,
    );
    await new Promise((r) => setTimeout(r, 20));
    res.destroy(); // el navegador cerró la conexión

    await expect(promesa).resolves.toBe('cancelado');
    expect(fuente.destroyed).toBe(true);
    expect(storage.getObjectStream).toHaveBeenCalledTimes(1); // no siguió con los demás
    expect(metadataAuditada(auditoria)).toMatchObject({
      resultado: 'cancelado',
    });
  });

  it('si S3 falla a medio archivo corta la respuesta (ZIP incompleto) y registra "error"', async () => {
    const fuente = new PassThrough();
    const storage = { getObjectStream: jest.fn().mockResolvedValue(fuente) };
    const { service } = crearServicio({ storage });
    const res = new RespuestaFalsa();
    res.on('error', () => undefined);

    const promesa = service.transmitir(
      plan([entrada(`${CARPETA_CV}/CV.pdf`)]),
      res as never,
      ACTOR,
    );
    await new Promise((r) => setTimeout(r, 20));
    fuente.destroy(new Error('ECONNRESET'));

    await expect(promesa).resolves.toBe('error');
    expect(res.destroyed).toBe(true);
  });
});

describe('ExpedienteZipService.reservarTurno', () => {
  it('limita las descargas simultáneas y libera el turno una sola vez', () => {
    const { service } = crearServicio({
      config: { EXPEDIENTE_ZIP_MAX_SIMULTANEAS: '1' },
    });
    const liberar = service.reservarTurno();
    expect(() => service.reservarTurno()).toThrow(ServiceUnavailableException);
    liberar();
    liberar(); // idempotente: no deja el contador negativo
    const otro = service.reservarTurno();
    expect(() => service.reservarTurno()).toThrow(ServiceUnavailableException);
    otro();
  });
});

// ─── Permisos del endpoint ─────────────────────────────────────────────────────

describe('GET /candidatos/:id/documentos-zip — permisos', () => {
  const handler = Object.getOwnPropertyDescriptor(
    ExpedienteController.prototype,
    'descargarDocumentosZip',
  )?.value as object;

  it('exige JWT y RBAC (evaluador/administrador) y aplica el límite por usuario', () => {
    const guardsClase: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      ExpedienteController,
    );
    expect(guardsClase).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ExpedienteController)).toEqual([
      'evaluador',
      'administrador',
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      UserThrottlerGuard,
    ]);
  });

  const contexto = (user: unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => ExpedienteController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;
  const guard = new RolesGuard(new Reflector());

  it.each(['evaluador', 'administrador'])('permite al rol %s', (rol) => {
    expect(guard.canActivate(contexto({ rol }))).toBe(true);
  });

  it('rechaza al postulante (403) y a peticiones sin usuario', () => {
    expect(() => guard.canActivate(contexto({ rol: 'postulante' }))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(contexto(undefined))).toBe(false);
  });
});
