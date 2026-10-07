import {
  vincularCvConDocumentos,
  compararCursos,
  normalizarNombreCurso,
  unificarCursos,
} from './cursos-match.util';
import type { ItemBase } from './resumen-fechas.types';

const curso = (
  origen: 'subido' | 'cv',
  nombre: string,
  fechas: Partial<
    Pick<
      ItemBase,
      | 'fechaInicio'
      | 'fechaEmision'
      | 'fechaVencimiento'
      | 'fechaVencimientoEstimada'
    >
  > = {},
  institucion: string | null = null,
): ItemBase => ({
  tipo: 'Curso',
  nombre,
  detalle: null,
  aplicaVencimiento: true,
  institucion,
  fechaInicio: fechas.fechaInicio ?? null,
  fechaEmision: fechas.fechaEmision ?? null,
  fechaVencimiento: fechas.fechaVencimiento ?? null,
  fechaVencimientoEstimada: fechas.fechaVencimientoEstimada ?? false,
  confianzaCV: null,
  origen,
  nombreEnCV: null,
  discrepancia: null,
  fuente: [origen === 'cv' ? 'CV' : 'Cursos registrados'],
});

// Caso real reportado: mismo curso, del CV (con referencias STCW, truncado)
// y subido por el postulante.
const BOTES_CV =
  'Suficiencia en el manejo de botes de rescate rápidos - STCW Reg.VI/3…';
const BOTES_SUBIDO = 'Suficiencia en el manejo de Botes de Rescate Rápidos';

describe('normalizarNombreCurso', () => {
  it('caso real: quita acentos, mayúsculas, referencias STCW y puntuación', () => {
    const cv = normalizarNombreCurso(BOTES_CV);
    const subido = normalizarNombreCurso(BOTES_SUBIDO);
    expect(cv.clave).toBe(
      'suficiencia en el manejo de botes de rescate rapidos',
    );
    expect(cv.clave).toBe(subido.clave);
    expect(cv.refs).toEqual(['vi/3']);
    expect(subido.refs).toEqual([]);
  });

  it('quita Sección/Tabla/Regla, OMI y años del convenio', () => {
    const n = normalizarNombreCurso(
      'Formación Básica en Seguridad (STCW 78/95 enmendado 2010, Regla VI/1, Sección A-VI/1, Tabla A-VI/1-1, curso modelo OMI 1.19)',
    );
    expect(n.clave).toBe('formacion basica en seguridad');
    expect(n.refs).toEqual(['vi/1', 'vi/1-1']);
  });

  it('descarta palabras vacías y genéricas en los tokens', () => {
    expect(
      normalizarNombreCurso('Curso de Primeros Auxilios Básicos').tokens,
    ).toEqual(['primero', 'auxilio', 'basico']);
  });

  it('quita la extensión de archivo', () => {
    expect(
      normalizarNombreCurso('Updating for Engineer Officer.pdf').clave,
    ).toBe('updating for engineer officer');
  });
});

describe('compararCursos', () => {
  it('caso real: une el curso del CV con el subido', () => {
    expect(
      compararCursos(
        { nombre: BOTES_CV, fechaVencimiento: null },
        { nombre: BOTES_SUBIDO, fechaVencimiento: null },
      ).mismoCurso,
    ).toBe(true);
  });

  it('un año en el nombre no impide unir', () => {
    expect(
      compararCursos(
        {
          nombre: 'Formación básica en seguridad (STCW enmendado 2010)',
          fechaVencimiento: null,
        },
        { nombre: 'Formación Básica en Seguridad', fechaVencimiento: null },
      ).mismoCurso,
    ).toBe(true);
  });

  it('une variantes con palabras de relleno ("Curso de …")', () => {
    expect(
      compararCursos(
        { nombre: 'Curso de Protección del Buque', fechaVencimiento: null },
        { nombre: 'Protección del buque', fechaVencimiento: null },
      ).mismoCurso,
    ).toBe(true);
  });

  it('NO une botes de rescate rápidos con botes de rescate y balsas', () => {
    expect(
      compararCursos(
        { nombre: BOTES_SUBIDO, fechaVencimiento: null },
        {
          nombre:
            'Suficiencia en el manejo de embarcaciones de supervivencia y botes de rescate',
          fechaVencimiento: null,
        },
      ).mismoCurso,
    ).toBe(false);
  });

  it('NO une el curso básico con el avanzado aunque el nombre sea casi igual', () => {
    expect(
      compararCursos(
        { nombre: 'Lucha contra incendios', fechaVencimiento: null },
        { nombre: 'Lucha contra incendios avanzada', fechaVencimiento: null },
      ).mismoCurso,
    ).toBe(false);
  });

  it('NO une un curso con su actualización (updating)', () => {
    expect(
      compararCursos(
        { nombre: 'Engineer Officer', fechaVencimiento: null },
        { nombre: 'Updating for Engineer Officer', fechaVencimiento: null },
      ).mismoCurso,
    ).toBe(false);
  });

  it('NO une si citan reglas STCW distintas', () => {
    expect(
      compararCursos(
        {
          nombre: 'Formación en seguridad STCW Reg. VI/1',
          fechaVencimiento: null,
        },
        {
          nombre: 'Formación en seguridad STCW Reg. VI/6',
          fechaVencimiento: null,
        },
      ).mismoCurso,
    ).toBe(false);
  });

  it('con el mismo vencimiento acepta una similitud menor del nombre', () => {
    // Similitud 0.67: por nombre solo no alcanza (0.85), con vencimiento sí (0.6)
    const a = {
      nombre: 'Manejo de cargas peligrosas a bordo',
      fechaVencimiento: '2029-05-10',
    };
    const b = { nombre: 'Cargas peligrosas', fechaVencimiento: '2029-05-10' };
    expect(compararCursos(a, b).mismoCurso).toBe(true);
    expect(
      compararCursos(a, { ...b, fechaVencimiento: '2030-01-01' }).mismoCurso,
    ).toBe(false);
    // Una fecha estimada no cuenta como coincidencia de vencimiento
    expect(
      compararCursos(a, { ...b, fechaVencimientoEstimada: true }).mismoCurso,
    ).toBe(false);
  });
});

describe('unificarCursos', () => {
  it('caso real: une, conserva datos subidos y marca origen subido_y_cv', () => {
    const [r, ...resto] = unificarCursos(
      [
        curso('subido', BOTES_SUBIDO, {
          fechaInicio: '2024-03-01',
          fechaVencimiento: '2029-03-01',
        }),
      ],
      [
        curso(
          'cv',
          BOTES_CV,
          { fechaEmision: '2024-03-05', fechaVencimiento: '2029-03-01' },
          'CENAC Veracruz',
        ),
      ],
    );
    expect(resto).toHaveLength(0);
    expect(r.nombre).toBe(BOTES_SUBIDO);
    expect(r.origen).toBe('subido_y_cv');
    expect(r.nombreEnCV).toBe(BOTES_CV);
    expect(r.fechaInicio).toBe('2024-03-01'); // prevalece el subido
    expect(r.fechaEmision).toBe('2024-03-05'); // el CV completa lo vacío
    expect(r.institucion).toBe('CENAC Veracruz');
    expect(r.discrepancia).toBeNull();
    expect(r.fuente).toEqual(['Cursos registrados', 'CV']);
  });

  it('marca discrepancia si el CV dice otro vencimiento', () => {
    const [r] = unificarCursos(
      [curso('subido', BOTES_SUBIDO, { fechaVencimiento: '2029-03-01' })],
      [curso('cv', BOTES_CV, { fechaVencimiento: '2027-03-01' })],
    );
    expect(r.fechaVencimiento).toBe('2029-03-01');
    expect(r.discrepancia).toEqual({
      fechaVencimientoSubido: '2029-03-01',
      fechaVencimientoCV: '2027-03-01',
    });
  });

  it('un vencimiento estimado del subido cede ante el real del CV, sin discrepancia', () => {
    const [r] = unificarCursos(
      [
        curso('subido', BOTES_SUBIDO, {
          fechaInicio: '2024-03-01',
          fechaVencimiento: '2029-03-01',
          fechaVencimientoEstimada: true,
        }),
      ],
      [curso('cv', BOTES_CV, { fechaVencimiento: '2027-03-01' })],
    );
    expect(r.fechaVencimiento).toBe('2027-03-01');
    expect(r.fechaVencimientoEstimada).toBe(false);
    expect(r.discrepancia).toBeNull();
  });

  it('si nadie trae fecha real, conserva la estimada marcada como tal', () => {
    const [r] = unificarCursos(
      [
        curso('subido', BOTES_SUBIDO, {
          fechaVencimiento: '2029-03-01',
          fechaVencimientoEstimada: true,
        }),
      ],
      [curso('cv', BOTES_CV)],
    );
    expect(r.fechaVencimiento).toBe('2029-03-01');
    expect(r.fechaVencimientoEstimada).toBe(true);
  });

  it('renovación: una subida con fecha real gana a otra con fecha estimada', () => {
    const r = unificarCursos(
      [
        curso('subido', 'Radar ARPA', {
          fechaVencimiento: '2031-01-01',
          fechaVencimientoEstimada: true,
        }),
        curso('subido', 'Radar ARPA', { fechaVencimiento: '2028-06-01' }),
      ],
      [],
    );
    expect(r).toHaveLength(1);
    expect(r[0].fechaVencimiento).toBe('2028-06-01');
    expect(r[0].fechaVencimientoEstimada).toBe(false);
  });

  it('deja por separado los cursos del CV sin equivalente subido', () => {
    const r = unificarCursos(
      [curso('subido', BOTES_SUBIDO)],
      [curso('cv', BOTES_CV), curso('cv', 'Lucha contra incendios avanzada')],
    );
    expect(r.map((c) => [c.nombre, c.origen])).toEqual([
      [BOTES_SUBIDO, 'subido_y_cv'],
      ['Lucha contra incendios avanzada', 'cv'],
    ]);
  });

  it('ignora un curso repetido dentro del CV', () => {
    const r = unificarCursos(
      [],
      [curso('cv', 'Radar ARPA'), curso('cv', 'RADAR ARPA.')],
    );
    expect(r).toHaveLength(1);
  });

  it('renovación subida dos veces: conserva la de vencimiento más reciente', () => {
    const r = unificarCursos(
      [
        curso('subido', 'Formación básica en seguridad', {
          fechaVencimiento: '2021-01-10',
        }),
        curso('subido', 'Formacion Basica en Seguridad', {
          fechaVencimiento: '2026-01-10',
        }),
      ],
      [],
    );
    expect(r).toHaveLength(1);
    expect(r[0].fechaVencimiento).toBe('2026-01-10');
  });
});

describe('vincularCvConDocumentos (curso del CV ↔ documento personal)', () => {
  const doc = (tipoDocumento: string, venc: string) =>
    ({
      tipo: 'Documento personal',
      nombre: 'Refrendo',
      detalle: 'refrendo.pdf',
      aplicaVencimiento: true,
      institucion: null,
      fechaInicio: null,
      fechaEmision: '2021-06-01',
      fechaVencimiento: venc,
      fechaVencimientoEstimada: false,
      confianzaCV: null,
      origen: 'doc_personal',
      nombreEnCV: null,
      discrepancia: null,
      fuente: ['Documentos personales'],
      docPersonal: { id: 'd1', tipoDocumento } as never,
    }) as ItemBase;
  const cv = (nombre: string, venc: string | null) =>
    ({
      tipo: 'Curso',
      nombre,
      detalle: null,
      aplicaVencimiento: true,
      institucion: null,
      fechaInicio: null,
      fechaEmision: null,
      fechaVencimiento: venc,
      fechaVencimientoEstimada: false,
      confianzaCV: null,
      origen: 'cv',
      nombreEnCV: null,
      discrepancia: null,
      fuente: ['CV'],
    }) as ItemBase;

  it('"Actualización para Maquinista Naval" con el mismo vencimiento → un solo registro (el refrendo)', () => {
    const r = vincularCvConDocumentos(
      [cv('Actualización para Maquinista Naval', '2026-06-01')],
      [doc('refrendo', '2026-06-01')],
    );
    expect(r.cursos).toHaveLength(0);
    expect(r.documentos[0].nombreEnCV).toBe(
      'Actualización para Maquinista Naval',
    );
    expect(r.documentos[0].fuente).toEqual(['Documentos personales', 'CV']);
  });

  it('vencimiento distinto → no se vinculan', () => {
    const r = vincularCvConDocumentos(
      [cv('Actualización para Maquinista Naval', '2025-06-01')],
      [doc('refrendo', '2026-06-01')],
    );
    expect(r.cursos).toHaveLength(1);
    expect(r.documentos[0].nombreEnCV).toBeNull();
  });

  it('nombre que no corresponde al tipo → no se vinculan aunque coincida la fecha', () => {
    const r = vincularCvConDocumentos(
      [cv('Lucha contra incendios', '2026-06-01')],
      [doc('refrendo', '2026-06-01')],
    );
    expect(r.cursos).toHaveLength(1);
  });
});
