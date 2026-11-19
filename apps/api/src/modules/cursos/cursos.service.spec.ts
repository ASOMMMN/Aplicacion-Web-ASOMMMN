import { Types } from 'mongoose';
import { CursosService } from './cursos.service';
import { sinFechas } from '../docs-personales/ia/extraer-fechas-doc-personal';
import type { ResultadoExtraccionFechas } from '../docs-personales/ia/extraer-fechas-doc-personal';

const USUARIO = new Types.ObjectId().toString();

/** Resultado de la IA para un curso (sin datos reales). */
function lectura(fechas: {
  fechaInicio?: string | null;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
}): ResultadoExtraccionFechas {
  const det = (valor: string | null | undefined) => ({
    valor: valor ?? null,
    textoLiteral: valor ?? null,
    etiqueta: null,
    confianza: valor ? ('alta' as const) : ('baja' as const),
    precision: 'dia' as const,
  });
  return {
    modelo: 'gpt-4o-2024-11-20',
    resultado: {
      ...sinFechas(true, ''),
      errorMensaje: undefined,
      fechaInicio: fechas.fechaInicio ?? null,
      fechaEmision: fechas.fechaEmision ?? null,
      fechaVencimiento: fechas.fechaVencimiento ?? null,
      confianza: {
        fechaInicio: fechas.fechaInicio ? 'alta' : 'baja',
        fechaEmision: fechas.fechaEmision ? 'alta' : 'baja',
        fechaVencimiento: fechas.fechaVencimiento ? 'alta' : 'baja',
      },
      detalle: {
        fechaInicio: det(fechas.fechaInicio),
        fechaEmision: det(fechas.fechaEmision),
        fechaVencimiento: det(fechas.fechaVencimiento),
      },
      datosCurso: {
        nombreCurso: 'Control de multitudes',
        institucion: 'Centro de ejemplo',
        fechaFinCurso: det(null),
      },
      motivosRevision: [],
      revisar: false,
    },
  };
}

function crear(analisis: ResultadoExtraccionFechas | null) {
  const cursoModel = {
    create: jest.fn((datos: Record<string, unknown>) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...datos }),
    ),
  };
  const postulanteModel = {
    findOne: jest.fn(() => Promise.resolve({ _id: new Types.ObjectId() })),
  };
  const usuarioModel = {
    findById: () => ({
      select: () => ({ lean: () => Promise.resolve({ nombre: 'Prueba' }) }),
    }),
  };
  const storage = {
    putObject: jest.fn(() =>
      Promise.resolve({ url: 'https://s3/x.pdf', key: 'asommmn/cursos/x.pdf' }),
    ),
  };
  const extraccionIa = {
    extraer: jest.fn(() => Promise.resolve(analisis)),
  };
  const notificacionesApp = {
    avisarDocumentoSubido: jest.fn().mockResolvedValue(true),
  };
  const servicio = new CursosService(
    cursoModel as never,
    postulanteModel as never,
    usuarioModel as never,
    storage as never,
    { registrar: jest.fn() } as never,
    { get: () => undefined } as never,
    extraccionIa as never,
    notificacionesApp as never,
  );
  return { servicio, cursoModel, extraccionIa, notificacionesApp };
}

const archivo = {
  originalname: 'curso.pdf',
  mimetype: 'application/pdf',
  size: 10,
  buffer: Buffer.from('%PDF-1.4'),
} as Express.Multer.File;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const guardado = (cursoModel: { create: jest.Mock }) =>
  (cursoModel.create.mock.calls as unknown[][])[0][0] as Record<
    string,
    unknown
  >;
const iso = (v: unknown) => (v as Date | undefined)?.toISOString().slice(0, 10);

describe('CursosService.crearCurso: regla de vencimiento y evidencia', () => {
  it('con documento y sin vencimiento: inicio + 5 años, estimado (Control de multitudes)', async () => {
    const { servicio, cursoModel, extraccionIa } = crear(
      lectura({ fechaInicio: '2022-06-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      {
        nombreCurso: 'Control de multitudes',
        apareceEnCV: false,
        fechaInicio: '2022-06-25',
      },
      archivo,
    );
    const c = guardado(cursoModel);
    expect(iso(c.fechaVencimiento)).toBe('2027-06-25');
    expect(c.origenVencimiento).toBe('CALCULADO_5_ANOS');
    expect(c.fechaVencimientoEstimada).toBe(true);
    expect(c.revisarFechas).toBe(false);
    expect(extraccionIa.extraer).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'curso',
        usarCache: true,
        reextraer: false,
      }),
    );
  });

  it('con vencimiento del documento: esa fecha exacta (Botes de rescate)', async () => {
    const { servicio, cursoModel } = crear(
      lectura({ fechaInicio: '2024-04-26', fechaVencimiento: '2029-04-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      {
        nombreCurso: 'Botes de rescate',
        apareceEnCV: false,
        fechaInicio: '2024-04-26',
        fechaVencimiento: '2029-04-25',
      },
      archivo,
    );
    const c = guardado(cursoModel);
    expect(iso(c.fechaVencimiento)).toBe('2029-04-25');
    expect(c.origenVencimiento).toBe('DOCUMENTO');
    expect(c.fechaVencimientoEstimada).toBe(false);
  });

  it('emisión e inicio se guardan por separado (ya no se copia la emisión en el inicio)', async () => {
    const { servicio, cursoModel } = crear(
      lectura({ fechaEmision: '2023-03-06' }),
    );
    await servicio.crearCurso(
      USUARIO,
      { nombreCurso: 'PBIP', apareceEnCV: false, fechaEmision: '2023-03-06' },
      archivo,
    );
    const c = guardado(cursoModel);
    expect(c.fechaInicio).toBeUndefined();
    expect(iso(c.fechaEmision)).toBe('2023-03-06');
    expect(iso(c.fechaVencimiento)).toBe('2028-03-06');
    expect(iso(c.fechaCurso)).toBe('2023-03-06');
  });

  it('sin inicio ni emisión: REQUIERE_REVISION, sin inventar fecha', async () => {
    const { servicio, cursoModel } = crear(lectura({}));
    await servicio.crearCurso(
      USUARIO,
      { nombreCurso: 'Supervivencia', apareceEnCV: false },
      archivo,
    );
    const c = guardado(cursoModel);
    expect(c.fechaVencimiento).toBeUndefined();
    expect(c.origenVencimiento).toBe('REQUIERE_REVISION');
    expect(c.revisarFechas).toBe(true);
  });

  it('el postulante capturó un vencimiento que el documento no muestra → Revisar', async () => {
    const { servicio, cursoModel } = crear(
      lectura({ fechaInicio: '2022-06-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      {
        nombreCurso: 'Control de multitudes',
        apareceEnCV: false,
        fechaInicio: '2022-06-25',
        fechaVencimiento: '2030-01-01',
      },
      archivo,
    );
    const c = guardado(cursoModel);
    expect(c.revisarFechas).toBe(true);
    expect((c.motivosRevision as string[]).join(' ')).toMatch(
      /no muestra vencimiento/,
    );
  });

  it('sin documento (solo CV): no se aplica la regla de 5 años', async () => {
    const { servicio, cursoModel, extraccionIa } = crear(null);
    await servicio.crearCurso(USUARIO, {
      nombreCurso: 'Curso del CV',
      apareceEnCV: true,
      fechaInicio: '2022-06-25',
    });
    const c = guardado(cursoModel);
    expect(c.fechaVencimiento).toBeUndefined();
    expect(c.origenVencimiento).toBeUndefined();
    expect(extraccionIa.extraer).not.toHaveBeenCalled();
  });

  it('acepta imágenes (JPG/PNG) como documento del curso', async () => {
    const { servicio, cursoModel } = crear(
      lectura({ fechaInicio: '2022-06-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      { nombreCurso: 'Foto', apareceEnCV: false, fechaInicio: '2022-06-25' },
      {
        ...archivo,
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        buffer: JPEG,
      },
    );
    expect(cursoModel.create).toHaveBeenCalled();
  });

  it('rechaza un archivo cuyo contenido no es PDF/JPG/PNG aunque el mimetype lo diga', async () => {
    const { servicio, cursoModel } = crear(lectura({}));
    await expect(
      servicio.crearCurso(
        USUARIO,
        { nombreCurso: 'Falso', apareceEnCV: false },
        {
          ...archivo,
          mimetype: 'application/pdf',
          buffer: Buffer.from('<html>no soy un pdf</html>'),
        },
      ),
    ).rejects.toThrow('Documento extra inválido');
    expect(cursoModel.create).not.toHaveBeenCalled();
  });

  it('guarda y analiza con el tipo real, no con el mimetype del cliente', async () => {
    const { servicio, cursoModel, extraccionIa } = crear(
      lectura({ fechaInicio: '2022-06-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      { nombreCurso: 'Mimetype falso', apareceEnCV: false },
      { ...archivo, mimetype: 'image/png', buffer: JPEG },
    );
    const doc = guardado(cursoModel).documentoExtra as Record<string, unknown>;
    expect(doc.tipoMime).toBe('image/jpeg');
    expect(extraccionIa.extraer).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/jpeg' }),
    );
  });
});

describe('CursosService.crearCurso: campanita de evaluadores', () => {
  it('con archivo avisa "documento subido" (sin el nombre del curso)', async () => {
    const { servicio, notificacionesApp } = crear(
      lectura({ fechaInicio: '2022-06-25' }),
    );
    await servicio.crearCurso(
      USUARIO,
      { nombreCurso: 'X', apareceEnCV: false, fechaInicio: '2022-06-25' },
      archivo,
    );
    expect(notificacionesApp.avisarDocumentoSubido).toHaveBeenCalledWith(
      USUARIO,
      'Constancia de curso',
    );
  });

  it('sin archivo (solo CV) no es una subida: no avisa', async () => {
    const { servicio, notificacionesApp } = crear(null);
    await servicio.crearCurso(USUARIO, {
      nombreCurso: 'Curso del CV',
      apareceEnCV: true,
      fechaInicio: '2022-06-25',
    });
    expect(notificacionesApp.avisarDocumentoSubido).not.toHaveBeenCalled();
  });
});
