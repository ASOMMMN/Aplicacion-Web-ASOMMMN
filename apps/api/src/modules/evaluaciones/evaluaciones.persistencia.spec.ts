import { Connection, Model, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EvaluacionesService } from './evaluaciones.service';
import { CrearEvaluacionDto } from './dto/crear-evaluacion.dto';
import {
  Evaluacion,
  EvaluacionDocument,
  EvaluacionSchema,
} from './schemas/evaluacion.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';

/**
 * Bug de QA: evaluar un documento SIN comentario respondía 500 (el esquema
 * exigía `comentario`) y al refrescar volvía a "Sin evaluar". Estas pruebas
 * usan un MongoDB real en memoria para comprobar que la evaluación se guarda
 * y que GET /evaluaciones/:id/documentos la devuelve.
 */
jest.setTimeout(120_000);

const RESULTADOS = ['APROBADO', 'RECHAZADO', 'EN_REVISION'] as const;
const COMENTARIOS_VACIOS: [string, unknown][] = [
  ['sin comentario', undefined],
  ['vacío', ''],
  ['solo espacios', '   '],
  ['null', null],
];

describe('Evaluación de documentos — persistencia (MongoDB en memoria)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let evaluacionModel: Model<EvaluacionDocument>;
  let servicio: EvaluacionesService;

  const evaluadorId = new Types.ObjectId();
  let postulanteId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    conexion = await createConnection(mongod.getUri()).asPromise();
    evaluacionModel = conexion.model<EvaluacionDocument>(
      Evaluacion.name,
      EvaluacionSchema,
    );
    // populate('evaluadorId') necesita el modelo Usuario registrado en la conexión.
    conexion.model(Usuario.name, UsuarioSchema);

    const postulanteModel = {
      findById: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve({ _id: new Types.ObjectId(id) }),
        ),
    };
    const usuarioModel = {
      findById: jest.fn().mockResolvedValue({
        _id: evaluadorId,
        nombre: 'Eva',
        apellidos: 'Luadora',
        email: 'eva@x.com',
      }),
    };
    servicio = new EvaluacionesService(
      postulanteModel as never,
      {} as never,
      usuarioModel as never,
      {} as never,
      evaluacionModel,
      {} as never,
      { registrar: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      { get: jest.fn() } as never,
    );
  });

  afterAll(async () => {
    await conexion?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    postulanteId = new Types.ObjectId().toString();
    await evaluacionModel.deleteMany({});
  });

  /** Lo que la página del candidato vuelve a pedir al refrescar. */
  async function ultimaEvaluacionDe(clave: string) {
    const docs = await servicio.listarEvaluacionesPorDocumento(postulanteId);
    return (
      docs.find((d) => d.documentoClave === clave)?.ultimaEvaluacion ?? null
    );
  }

  describe.each(RESULTADOS)('resultado %s', (resultadoEvaluacion) => {
    it.each(COMENTARIOS_VACIOS)(
      'se guarda %s y sobrevive al refrescar (comentario = "")',
      async (_caso, comentario) => {
        const creada = await servicio.evaluarDocumento(
          postulanteId,
          evaluadorId.toString(),
          {
            documentoClave: 'certificado_medico',
            resultadoEvaluacion,
            comentario: comentario as string | undefined,
          },
        );

        expect(creada.resultadoEvaluacion).toBe(resultadoEvaluacion);
        expect(creada.comentario).toBe('');

        const ultima = await ultimaEvaluacionDe('certificado_medico');
        expect(ultima).toMatchObject({
          id: creada.id,
          resultadoEvaluacion,
          comentario: '',
        });
        expect(
          await evaluacionModel.countDocuments({
            postulanteId: new Types.ObjectId(postulanteId),
          }),
        ).toBe(1);
      },
    );

    it('con texto se guarda recortado', async () => {
      await servicio.evaluarDocumento(postulanteId, evaluadorId.toString(), {
        documentoClave: 'certificado_medico',
        resultadoEvaluacion,
        comentario: '  Vigente hasta 2027  ',
      });

      const ultima = await ultimaEvaluacionDe('certificado_medico');
      expect(ultima).toMatchObject({
        resultadoEvaluacion,
        comentario: 'Vigente hasta 2027',
      });
    });
  });

  it('una re-evaluación sin comentario queda como la última del historial', async () => {
    await servicio.evaluarDocumento(postulanteId, evaluadorId.toString(), {
      documentoClave: 'certificado_medico',
      resultadoEvaluacion: 'RECHAZADO',
      comentario: 'Ilegible',
    });
    await new Promise((r) => setTimeout(r, 5)); // creadoEn distinto para el orden
    await servicio.evaluarDocumento(postulanteId, evaluadorId.toString(), {
      documentoClave: 'certificado_medico',
      resultadoEvaluacion: 'APROBADO',
    });

    const docs = await servicio.listarEvaluacionesPorDocumento(postulanteId);
    const certificado = docs.find(
      (d) => d.documentoClave === 'certificado_medico',
    );
    expect(certificado?.historial).toHaveLength(2);
    expect(certificado?.ultimaEvaluacion?.resultadoEvaluacion).toBe('APROBADO');
  });

  it('documentos con evaluaciones legadas sin comentario siguen leyéndose', async () => {
    await evaluacionModel.collection.insertOne({
      postulanteId: new Types.ObjectId(postulanteId),
      evaluadorId,
      documentoClave: 'certificado_medico',
      resultadoEvaluacion: 'APROBADO',
      creadoEn: new Date(),
    });
    expect(await ultimaEvaluacionDe('certificado_medico')).toMatchObject({
      resultadoEvaluacion: 'APROBADO',
    });
  });
});

describe('CrearEvaluacionDto — comentario opcional', () => {
  it.each(COMENTARIOS_VACIOS)(
    'acepta comentario %s',
    async (_caso, comentario) => {
      const dto = plainToInstance(CrearEvaluacionDto, {
        documentoClave: 'certificado_medico',
        resultadoEvaluacion: 'APROBADO',
        comentario,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('rechaza comentarios de más de 1000 caracteres', async () => {
    const dto = plainToInstance(CrearEvaluacionDto, {
      documentoClave: 'certificado_medico',
      resultadoEvaluacion: 'APROBADO',
      comentario: 'x'.repeat(1001),
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
