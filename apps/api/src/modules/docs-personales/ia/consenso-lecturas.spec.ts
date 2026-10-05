import { consensoLecturas, IdLectura } from './consenso-lecturas';
import { normalizarRespuesta } from './extraer-fechas-doc-personal';

const lectura = (
  id: IdLectura,
  venc: string | null,
  confianza: 'alta' | 'media' | 'baja' = 'alta',
  emision: string | null = '2020-01-10',
) => ({
  id,
  resultado: normalizarRespuesta({
    tipoDetectado: 'pasaporte',
    confianzaTipo: 'alta',
    fechaEmision: { valor: emision, textoLiteral: emision, confianza: 'alta' },
    fechaVencimiento: { valor: venc, textoLiteral: venc, confianza },
  }),
});

describe('consensoLecturas', () => {
  it('una sola lectura: se usa tal cual', () => {
    const r = consensoLecturas([lectura('ia1', '2030-01-09', 'media')]);
    expect(r.porCampo.fechaVencimiento.estado).toBe('una_lectura');
    expect(r.resultado.confianza.fechaVencimiento).toBe('media');
    expect(r.requiereDesempate).toBe(false);
  });

  it('dos lecturas que coinciden → aceptada con confianza alta', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09', 'media'),
      lectura('ia2', '2030-01-09', 'media'),
    ]);
    expect(r.porCampo.fechaVencimiento.estado).toBe('unanime');
    expect(r.resultado.fechaVencimiento).toBe('2030-01-09');
    expect(r.resultado.confianza.fechaVencimiento).toBe('alta');
    expect(r.requiereDesempate).toBe(false);
  });

  it('dos lecturas que no coinciden → hace falta desempate', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09'),
      lectura('ia2', '2030-09-01'),
    ]);
    expect(r.requiereDesempate).toBe(true);
    expect(r.resultado.confianza.fechaVencimiento).toBe('baja');
  });

  it('una lectura con fecha y otra sin fecha también es desacuerdo', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09'),
      lectura('ia2', null),
    ]);
    expect(r.requiereDesempate).toBe(true);
  });

  it('tres lecturas, mayoría 2 de 3 → la mayoría, confianza media, sin motivo', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09'),
      lectura('ia2', '2030-09-01'),
      lectura('ia3', '2030-09-01'),
    ]);
    expect(r.porCampo.fechaVencimiento).toMatchObject({
      estado: 'mayoria',
      elegida: 'ia2',
    });
    expect(r.resultado.fechaVencimiento).toBe('2030-09-01');
    expect(r.resultado.confianza.fechaVencimiento).toBe('media');
    expect(r.motivos).toEqual([]);
  });

  it('tres lecturas sin mayoría → la más confiable, confianza baja y motivo', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09', 'media'),
      lectura('ia2', '2030-09-01', 'alta'),
      lectura('ia3', '2031-01-09', 'baja'),
    ]);
    expect(r.porCampo.fechaVencimiento).toMatchObject({
      estado: 'sin_mayoria',
      elegida: 'ia2',
    });
    expect(r.resultado.fechaVencimiento).toBe('2030-09-01');
    expect(r.resultado.confianza.fechaVencimiento).toBe('baja');
    expect(r.motivos.join(' ')).toMatch(/no coinciden en la vencimiento/);
  });

  it('cada campo se decide por separado', () => {
    const r = consensoLecturas([
      lectura('ia1', '2030-01-09', 'alta', '2020-01-10'),
      lectura('ia2', '2030-01-09', 'alta', '2020-10-01'),
      lectura('ia3', '2030-01-09', 'alta', '2020-01-10'),
    ]);
    expect(r.porCampo.fechaVencimiento.estado).toBe('unanime');
    expect(r.porCampo.fechaEmision.estado).toBe('mayoria');
    expect(r.resultado.fechaEmision).toBe('2020-01-10');
  });
});
