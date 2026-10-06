import { ObjectId } from 'mongodb';
import { planificar } from './migracion-vencimientos.util';

const curso = (extra: Record<string, unknown>) => ({
  _id: new ObjectId(),
  nombreCurso: 'Curso de prueba',
  ...extra,
});
const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const doc = { storagePath: 'cursos/x.pdf' };

describe('planificar (migración de vencimientos de cursos)', () => {
  it('vencimiento explícito: no se toca', () => {
    const p = planificar(
      curso({ fechaVencimiento: fecha('2029-04-25'), documentoExtra: doc }),
    );
    expect(p.accion).toBe('sin cambios: vencimiento explícito');
    expect(p.$set).toBeNull();
  });

  it('estimado existente: solo se marca el origen; la fecha no cambia', () => {
    const p = planificar(
      curso({
        fechaInicio: fecha('2022-06-25'),
        fechaVencimiento: fecha('2027-06-25'),
        fechaVencimientoEstimada: true,
      }),
    );
    expect(p.$set).toEqual({ origenVencimiento: 'CALCULADO_5_ANOS' });
    expect(p.nota).toMatch(/= base 2022-06-25 \+ 5 años/);
  });

  it('sin vencimiento, con documento e inicio: inicio + 5 años (Control de multitudes)', () => {
    const p = planificar(
      curso({ fechaInicio: fecha('2022-06-25'), documentoExtra: doc }),
    );
    expect(p.accion).toBe('calcular +5 años');
    expect((p.$set!.fechaVencimiento as Date).toISOString()).toBe(
      '2027-06-25T00:00:00.000Z',
    );
    expect(p.$set!.fechaVencimientoEstimada).toBe(true);
  });

  it('29/02 + 5 años → 28/02', () => {
    const p = planificar(
      curso({ fechaInicio: fecha('2024-02-29'), documentoExtra: doc }),
    );
    expect((p.$set!.fechaVencimiento as Date).toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });

  it('sin vencimiento ni fecha base, con documento: REQUIERE_REVISION sin inventar fecha', () => {
    const p = planificar(curso({ documentoExtra: doc }));
    expect(p.accion).toBe('requiere revisión');
    expect(p.$set).toMatchObject({ origenVencimiento: 'REQUIERE_REVISION' });
    expect(p.$set).not.toHaveProperty('fechaVencimiento');
  });

  it('sin documento: la regla no aplica', () => {
    const p = planificar(curso({ fechaInicio: fecha('2022-06-25') }));
    expect(p.accion).toBe('sin cambios: sin documento');
    expect(p.$set).toBeNull();
  });
});
