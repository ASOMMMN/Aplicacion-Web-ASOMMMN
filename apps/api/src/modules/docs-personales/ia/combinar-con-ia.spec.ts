import { createCanvas, loadImage } from '@napi-rs/canvas';
import OpenAI from 'openai';
import * as QRCode from 'qrcode';
import { cambiosPorAnalisis } from './cambios-analisis';
import { resumenFuentes } from './combinar-fuentes';
import {
  combinarConIa,
  extraerFechasDocPersonal,
  normalizarRespuesta,
  sinFechas,
} from './extraer-fechas-doc-personal';
import { extraerPorEtiquetas } from './extractor-etiquetas';
import { construirPromptImagenDocPersonal } from './prompts-doc-personal';
import { validarFechasDocPersonal } from './validar-fechas-doc-personal';

// Textos y QR de ejemplo, sin datos personales.

const HOY = '2026-09-30';
const texto = (t: string) =>
  extraerPorEtiquetas(t, { pagina: 1, fuente: 'texto' });

/** Respuesta del modelo ya validada. */
const iaValidada = (
  tipo: Parameters<typeof validarFechasDocPersonal>[0],
  crudo: Record<string, unknown>,
) => validarFechasDocPersonal(tipo, normalizarRespuesta(crudo), HOY);

const fecha = (valor: string | null, textoLiteral = valor) => ({
  valor,
  textoLiteral,
  etiqueta: null,
  confianza: 'alta',
});

describe('combinarConIa', () => {
  it('sin lecturas deterministas: la respuesta de la IA queda igual', () => {
    const v = iaValidada('pasaporte', {
      fechaEmision: fecha('2022-02-09', '09/02/2022'),
      fechaVencimiento: fecha('2028-02-09', '09/02/2028'),
    });
    const r = combinarConIa('pasaporte', v, []);
    expect(r.fechaVencimiento).toBe(v.fechaVencimiento);
    expect(r.motivosRevision).toEqual(v.motivosRevision);
    expect(r.fuentes?.fechaVencimiento).toMatchObject({
      fuente: 'ia',
      coincidente: false,
    });
    expect(r.principal).toBeNull();
  });

  it('las validaciones de orden también aplican a las fechas deterministas', () => {
    const r = combinarConIa(
      'refrendo',
      iaValidada('refrendo', {}),
      texto(
        'Fecha de Expedición: 09-05-2024\nFecha de Vencimiento: 09-05-2023',
      ),
    );
    expect(r.fechaVencimiento).toBe('2023-05-09');
    expect(r.revisar).toBe(true);
    expect(r.motivosRevision!.join(' ')).toMatch(
      /no es posterior a la emisión/,
    );
  });

  it('las validaciones de rango también aplican a las fechas deterministas', () => {
    const r = combinarConIa(
      'refrendo',
      iaValidada('refrendo', {}),
      texto(
        'Fecha de Expedición: 09-05-2024\nFecha de Vencimiento: 09-05-2034',
      ),
    );
    expect(r.motivosRevision!.join(' ')).toMatch(/no es plausible/);
  });

  it('tipo que no vence: el vencimiento de una etiqueta se descarta y no cuenta como fuente', () => {
    const r = combinarConIa(
      'CURP',
      iaValidada('CURP', {}),
      texto(
        'Fecha de inscripción: 01-02-2010\nFecha de vencimiento: 01-02-2030',
      ),
    );
    expect(r.fechaVencimiento).toBeNull();
    expect(r.fuentes?.fechaVencimiento).toMatchObject({
      valor: null,
      fuente: null,
    });
    expect(r.fechaEmision).toBe('2010-02-01');
  });

  it('IA coincidente con la etiqueta: sin motivos y con la fuente de mayor prioridad', () => {
    const v = iaValidada('refrendo', {
      fechaEmision: fecha('2024-05-19', '19-05-2024'),
      fechaVencimiento: fecha('2029-05-19', '19-05-2029'),
    });
    const r = combinarConIa(
      'refrendo',
      v,
      texto(
        'Fecha de Expedición: 19-05-2024\nFecha de Vencimiento: 19-05-2029',
      ),
    );
    expect(r.revisar).toBe(false);
    // Día > 12: no es ambigua (con 09-05 la validación la deja en "media").
    expect(r.confianza.fechaVencimiento).toBe('alta');
    expect(r.fuentes?.fechaVencimiento).toMatchObject({
      fuente: 'texto',
      coincidente: true,
    });
  });
});

describe('extraerFechasDocPersonal con QR (OpenAI simulado)', () => {
  it('el QR gana a la IA, se marca la diferencia y se guarda la evidencia', async () => {
    const cadena = '||FOLIO:0000000|DICTAMEN:19/12/2025|VIGENCIA:19/12/2027||';
    const qr = await loadImage(
      await QRCode.toBuffer(cadena, { width: 260, margin: 2 }),
    );
    const c = createCanvas(1700, 2200);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1700, 2200);
    ctx.fillStyle = '#000';
    for (let y = 150; y < 1500; y += 50) ctx.fillRect(150, y, 1300, 14);
    ctx.drawImage(qr, 150, 1800);

    const respuesta = {
      tipoDetectado: 'certificado_medico',
      fechaEmision: fecha('2025-12-19', '19/12/2025'),
      fechaVencimiento: fecha('2027-12-18', '18/12/2027'),
    };
    const openai = {
      chat: {
        completions: {
          create: () =>
            Promise.resolve({
              choices: [{ message: { content: JSON.stringify(respuesta) } }],
              usage: { prompt_tokens: 10, completion_tokens: 10 },
            }),
        },
      },
    } as unknown as OpenAI;

    const r = await extraerFechasDocPersonal({
      buffer: c.toBuffer('image/png'),
      mimeType: 'image/png',
      tipo: 'certificado_medico',
      apiKey: 'sk-test',
      modelo: 'gpt-4o',
      openai,
      onError: () => undefined,
    });

    const res = r.resultado;
    expect(res.fechaVencimiento).toBe('2027-12-19');
    expect(res.fuentes?.fechaVencimiento).toMatchObject({
      fuente: 'qr',
      coincidente: true,
    });
    expect(res.fuentes?.fechaEmision).toMatchObject({
      fuente: 'qr',
      coincidente: true,
    });
    expect(res.revisar).toBe(true);
    expect(res.motivosRevision!.join(' ')).toContain('la IA dice 18/12/2027');
    expect(res.evidenciaEstructurada).toEqual([
      { pagina: 1, origen: 'qr', texto: cadena },
    ]);
    expect(r.lecturasDeterministas?.length).toBe(2);

    const cambios = cambiosPorAnalisis(r)!;
    const d = cambios.detalleFechasIa as Record<string, unknown>;
    expect(d.fuentes).toBeDefined();
    expect(d.grupos).toHaveLength(1);
    expect(d.evidenciaEstructurada).toEqual(res.evidenciaEstructurada);
    expect(cambios.fechaVencimiento?.toISOString()).toBe(
      '2027-12-19T00:00:00.000Z',
    );
  }, 30000);
});

describe('resumenFuentes', () => {
  const base = { ...sinFechas(true, ''), errorMensaje: undefined };
  const guardado = (lecturas: string) => {
    const res = combinarConIa(
      'refrendo',
      { ...base, detalle: normalizarRespuesta({}).detalle },
      texto(lecturas),
    );
    return cambiosPorAnalisis({ modelo: 'm', resultado: res })!.detalleFechasIa;
  };

  it('expone fuente y coincidente por fecha', () => {
    const d = guardado(
      'Fecha de Expedición: 09-05-2024\nFecha de Vencimiento: 09-05-2029',
    );
    expect(resumenFuentes(d, false)).toEqual({
      fuentesFechas: {
        fechaEmision: { fuente: 'texto', coincidente: false, revisar: false },
        fechaVencimiento: {
          fuente: 'texto',
          coincidente: false,
          revisar: false,
        },
      },
    });
  });

  it('con más de un documento, los expone con el principal marcado', () => {
    const d = guardado(
      'Fecha de Expedición: 10-09-2021\nFecha de Vencimiento: 20-08-2023\nFecha de Expedición: 09-05-2024\nFecha de Vencimiento: 09-05-2029',
    );
    const r = resumenFuentes(d, false);
    expect(r.documentosDetectados).toHaveLength(2);
    expect(r.documentosDetectados?.map((g) => g.principal)).toEqual([
      false,
      true,
    ]);
    expect(r.documentosDetectados?.[1].fechas.fechaVencimiento?.valor).toBe(
      '2029-05-09',
    );
  });

  it('marca para revisar la fecha en conflicto, no las demás', () => {
    const ia = normalizarRespuesta({
      fechaEmision: fecha('2024-05-19', '19-05-2024'),
      fechaVencimiento: fecha('2029-04-05', '05-04-2029'),
    });
    const res = combinarConIa(
      'refrendo',
      validarFechasDocPersonal('refrendo', ia, HOY),
      texto(
        'Fecha de Expedición: 19-05-2024\nFecha de Vencimiento: 19-05-2029',
      ),
    );
    const d = cambiosPorAnalisis({
      modelo: 'm',
      resultado: res,
    })!.detalleFechasIa;
    expect(resumenFuentes(d, false).fuentesFechas).toEqual({
      fechaEmision: { fuente: 'texto', coincidente: true, revisar: false },
      fechaVencimiento: { fuente: 'texto', coincidente: false, revisar: true },
    });
  });

  it('vacío con fechas verificadas o con análisis anteriores', () => {
    expect(
      resumenFuentes(guardado('Fecha de Vencimiento: 09-05-2029'), true),
    ).toEqual({});
    expect(
      resumenFuentes({ fechaEmision: { valor: '2024-01-01' } }, false),
    ).toEqual({});
    expect(resumenFuentes(undefined, false)).toEqual({});
  });
});

describe('prompt', () => {
  it('incluye las etiquetas reales del tipo', () => {
    expect(construirPromptImagenDocPersonal('refrendo')).toContain(
      'Fecha de Expedición / Date of issuance',
    );
  });
});
