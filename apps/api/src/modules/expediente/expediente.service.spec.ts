import { ExpedienteService } from './expediente.service';
import type { ResumenFechaItem } from '../resumen-fechas/resumen-fechas.types';

/** Mínimo para construir un ResumenFechaItem de prueba. */
function item(
  tipo: ResumenFechaItem['tipo'],
  nombre: string,
  fechaVencimiento: string | null,
  extra: Partial<ResumenFechaItem> = {},
): ResumenFechaItem {
  return {
    tipo,
    nombre,
    detalle: null,
    aplicaVencimiento: true,
    institucion: null,
    fechaInicio: '2024-01-01',
    fechaEmision: '2024-01-01',
    fechaVencimiento,
    fechaVencimientoEstimada: false,
    confianzaCV: null,
    origen: 'subido',
    nombreEnCV: null,
    discrepancia: null,
    estadoVigencia: 'vigente',
    diasParaVencer: 100,
    fuente: [],
    ...extra,
  };
}

describe('ExpedienteService.generarBitacoraVigencias', () => {
  const cursosServiceMock = {} as never;
  const bitacoraServiceMock = {} as never;
  const auditoriaMock = { registrar: jest.fn().mockResolvedValue(undefined) };

  const items: ResumenFechaItem[] = [
    item('Curso', 'Curso B (vence en 60 días)', '2026-12-01'),
    item('Curso', 'Curso A (vence antes)', '2026-10-15'),
    item('Curso', 'Curso sin vencimiento', null),
    item('Documento personal', 'INE', '2027-01-01'),
    item('Documento personal', 'Pasaporte (estimado)', '2030-01-01', {
      metaFechas: {
        fechaVencimiento: {
          fuente: 'regla',
          precision: 'dia',
          confianza: null,
          evidencia: null,
          lector: null,
          bloqueada: false,
          editadoPorEmail: null,
          editadoEn: null,
        },
      },
    }),
  ];

  const resumenFechasServiceMock = {
    generarResumen: jest.fn().mockResolvedValue({
      titulo: 'x',
      postulante: 'Juan Pérez',
      fechaGeneracion: '2026-10-07',
      fechaReferencia: '2026-10-07',
      umbralPorVencerMeses: 3,
      conteo: {
        vencido: 0,
        por_vencer: 0,
        vigente: 0,
        sin_fecha: 0,
        no_aplica: 0,
      },
      items,
    }),
  };

  const service = new ExpedienteService(
    cursosServiceMock,
    bitacoraServiceMock,
    resumenFechasServiceMock as never,
    auditoriaMock as never,
  );

  const actor = { userId: 'u1', email: 'evaluador@asommmn.org' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('ordena por vencimiento ascendente (sin vencimiento al final)', () => {
    const conPrivados = service as unknown as {
      ordenarPorVencimiento(i: ResumenFechaItem[]): ResumenFechaItem[];
    };
    const cursos = items.filter((i) => i.tipo === 'Curso');
    const ordenados = conPrivados.ordenarPorVencimiento(cursos);
    expect(ordenados.map((i) => i.nombre)).toEqual([
      'Curso A (vence antes)',
      'Curso B (vence en 60 días)',
      'Curso sin vencimiento',
    ]);
  });

  it('genera el PDF con el nombre de archivo esperado y registra auditoría', async () => {
    const r = await service.generarBitacoraVigencias('p1', 'pdf', actor);
    expect(r.mimeType).toBe('application/pdf');
    expect(r.filename).toMatch(/^Bitacora_Vigencias_Juan_Perez_\d{8}\.pdf$/);
    expect(r.buffer.length).toBeGreaterThan(0);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'bitacora_vigencias_generada',
        recurso: 'Postulante',
        recursoId: 'p1',
        metadata: { formato: 'pdf' },
      }),
    );
  });

  it('genera el DOCX con el nombre de archivo esperado', async () => {
    const r = await service.generarBitacoraVigencias('p1', 'docx', actor);
    expect(r.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(r.filename).toMatch(/^Bitacora_Vigencias_Juan_Perez_\d{8}\.docx$/);
    expect(r.buffer.length).toBeGreaterThan(0);
  });
});
