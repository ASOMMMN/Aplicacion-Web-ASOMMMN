import { createCanvas } from '@napi-rs/canvas';
import OpenAI, { RateLimitError } from 'openai';
import {
  extraerFechasDocPersonal,
  formatoComprobado,
  hayConflictoFormatoFechas,
  lecturasDeterministas,
  normalizarRespuesta,
  normalizarConfianza,
  normalizarFechaIa,
  requiereSegundaLectura,
} from './extraer-fechas-doc-personal';

// Preparar imágenes (dos variantes por documento) cuesta CPU; con la suite
// completa en paralelo 5 s no alcanzan.
jest.setTimeout(30_000);

describe('normalizarFechaIa', () => {
  it('acepta YYYY-MM-DD de calendario válido', () => {
    expect(normalizarFechaIa('2031-01-15')).toBe('2031-01-15');
    expect(normalizarFechaIa(' 2024-02-29 ')).toBe('2024-02-29');
  });

  it('rechaza formatos distintos y fechas imposibles', () => {
    expect(normalizarFechaIa('15/01/2031')).toBeNull();
    expect(normalizarFechaIa('2023-02-29')).toBeNull();
    expect(normalizarFechaIa(null)).toBeNull();
    expect(normalizarFechaIa(20310115)).toBeNull();
  });
});

describe('normalizarConfianza', () => {
  it('solo alta|media|baja; lo demás → baja', () => {
    expect(normalizarConfianza('alta')).toBe('alta');
    expect(normalizarConfianza('ALTA')).toBe('baja');
    expect(normalizarConfianza(undefined)).toBe('baja');
  });
});

describe('extraerFechasDocPersonal (sin llamar a OpenAI)', () => {
  const base = {
    buffer: Buffer.from('x'),
    mimeType: 'image/png',
    tipo: 'pasaporte' as const,
    apiKey: 'sk-test',
    modelo: 'gpt-4o-mini',
  };

  it('sin API key → iaDisponible false', async () => {
    const { resultado, origen } = await extraerFechasDocPersonal({
      ...base,
      apiKey: '',
    });
    expect(resultado.iaDisponible).toBe(false);
    expect(resultado.fechaVencimiento).toBeNull();
    expect(origen).toBeUndefined();
  });

  it('archivo vacío → error sin llamar al modelo', async () => {
    const { resultado } = await extraerFechasDocPersonal({
      ...base,
      buffer: Buffer.alloc(0),
    });
    expect(resultado.errorMensaje).toBe('El archivo está vacío.');
  });

  it('formato no soportado → error sin llamar al modelo', async () => {
    const { resultado } = await extraerFechasDocPersonal({
      ...base,
      mimeType: 'application/msword',
    });
    expect(resultado.iaDisponible).toBe(true);
    expect(resultado.errorMensaje).toMatch(/no compatible/);
  });
});

describe('extraerFechasDocPersonal: errores 429 de OpenAI', () => {
  // Imagen sintética (sin datos reales): renglones negros sobre blanco.
  const png = (() => {
    const c = createCanvas(600, 400);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#000';
    for (let y = 50; y < 350; y += 30) ctx.fillRect(50, y, 500, 12);
    return c.toBuffer('image/png');
  })();

  const error429 = (code: string) =>
    new RateLimitError(
      429,
      { code, message: code },
      code,
      new Headers({ 'retry-after': '1' }),
    );

  const clienteFalso = (fallas: Error[]) => {
    const crear = jest.fn(() => {
      const f = fallas.shift();
      return f
        ? Promise.reject(f)
        : Promise.resolve({
            choices: [{ message: { content: '{"tipoDetectado":"visa"}' } }],
            usage: { prompt_tokens: 1234, completion_tokens: 56 },
          });
    });
    return {
      crear,
      openai: { chat: { completions: { create: crear } } } as unknown as OpenAI,
    };
  };

  const base = {
    buffer: png,
    mimeType: 'image/png',
    tipo: 'visa' as const,
    apiKey: 'sk-test',
    modelo: 'gpt-4o',
    onError: () => undefined,
    dormir: () => Promise.resolve(),
  };

  it('límite por minuto: reintenta y termina bien, con tokens reales', async () => {
    const { crear, openai } = clienteFalso([
      error429('rate_limit_exceeded'),
      error429('rate_limit_exceeded'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    // 2 reintentos + 2 lecturas (una imagen siempre lleva doble lectura;
    // como coinciden, no hay tercera).
    expect(crear).toHaveBeenCalledTimes(4);
    expect(r.resultado.errorMensaje).toBeUndefined();
    expect(r.tokens).toMatchObject({
      entrada: 2 * 1234,
      salida: 2 * 56,
      reintentos429: 2,
    });
    expect(r.tokens!.estimadoEntrada).toBeGreaterThan(0);
    // El SDK no debe reintentar por su cuenta.
    expect((crear.mock.calls[0] as unknown[])[1]).toEqual({ maxRetries: 0 });
  });

  it('límite por minuto que no cede: error "se reintentará" clasificado', async () => {
    const { openai } = clienteFalso(
      Array.from({ length: 10 }, () => error429('rate_limit_exceeded')),
    );
    const r = await extraerFechasDocPersonal({
      ...base,
      openai,
      reintentos: { maxIntentos: 2, esperaBaseMs: 1, esperaMaxMs: 1 },
    });
    expect(r.errorOpenAI?.tipo).toBe('limite_por_minuto');
    expect(r.resultado.errorMensaje).toMatch(
      /^Límite por minuto de OpenAI: se reintentará/,
    );
  });

  it('sin saldo: un solo intento y mensaje de recarga', async () => {
    const { crear, openai } = clienteFalso([error429('insufficient_quota')]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(r.errorOpenAI?.tipo).toBe('sin_saldo');
    expect(r.resultado.errorMensaje).toMatch(
      /^OpenAI sin saldo: recarga crédito/,
    );
  });
});

describe('formatoComprobado: el formato del modelo no basta', () => {
  const doc = (texto: string) => ({
    paginas: [{ numero: 1, texto, estructuradas: [] }],
  });
  const propuesta = (literal: string, etiqueta: string | null = null) =>
    normalizarRespuesta({
      formatoFechaIndicado: 'mm/dd/aaaa',
      fechaEmision: {
        valor: '2025-03-04',
        textoLiteral: literal,
        etiqueta,
        confianza: 'alta',
      },
    });

  it('el modelo dice mm/dd pero el documento no lo indica → null (dd/mm)', () => {
    expect(
      formatoComprobado(
        doc('Fecha de expedición: 03/04/2025'),
        propuesta('03/04/2025'),
      ),
    ).toBeNull();
  });

  it('indicador en la capa de texto → se usa', () => {
    expect(formatoComprobado(doc('Issue date (MM/DD/YYYY): 03/04/2025'))).toBe(
      'mm/dd/aaaa',
    );
  });

  it('indicador en la etiqueta que copió el modelo (imagen sin capa de texto) → se usa', () => {
    expect(
      formatoComprobado(
        doc(''),
        propuesta('03/04/2025', 'Date of issue (MM/DD/YYYY)'),
      ),
    ).toBe('mm/dd/aaaa');
  });
});

describe('lecturasDeterministas: MRZ de la capa de texto', () => {
  it('pasaporte: vencimiento de la MRZ como lectura determinista', () => {
    const texto = [
      'PASAPORTE',
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
    ].join('\n');
    const ls = lecturasDeterministas(
      { paginas: [{ numero: 1, texto, estructuradas: [] }] },
      null,
      'pasaporte',
    );
    expect(ls).toEqual([
      expect.objectContaining({
        campo: 'fechaVencimiento',
        valor: '2012-04-15',
        precision: 'dia',
        fuente: 'texto',
      }),
    ]);
  });
});

describe('extraerFechasDocPersonal: doble lectura con consenso', () => {
  // Imagen sintética (sin datos reales).
  const png = (() => {
    const c = createCanvas(600, 400);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#000';
    for (let y = 50; y < 350; y += 30) ctx.fillRect(50, y, 500, 12);
    return c.toBuffer('image/png');
  })();

  const fecha = (valor: string | null, literal: string | null = valor) => ({
    valor,
    textoLiteral: literal,
    etiqueta: null,
    confianza: valor ? 'alta' : 'baja',
    precision: 'dia',
  });
  const respuesta = (
    venc: string | null,
    extra: Record<string, unknown> = {},
  ) =>
    JSON.stringify({
      tipoDetectado: 'visa',
      confianzaTipo: 'alta',
      formatoFechaIndicado: null,
      fechaEmision: fecha('2019-05-10', '10 MAY 2019'),
      fechaInicio: fecha(null),
      fechaVencimiento: venc ? fecha(venc, venc) : fecha(null),
      ...extra,
    });

  /** Cliente que responde, en orden, las respuestas dadas. */
  const cliente = (respuestas: string[]) => {
    const crear = jest.fn(() =>
      Promise.resolve({
        choices: [{ message: { content: respuestas.shift() ?? '{}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      }),
    );
    return {
      crear,
      openai: { chat: { completions: { create: crear } } } as unknown as OpenAI,
    };
  };

  const base = {
    buffer: png,
    mimeType: 'image/png',
    tipo: 'visa' as const,
    apiKey: 'sk-test',
    modelo: 'gpt-4o-2024-11-20',
    onError: () => undefined,
    dormir: () => Promise.resolve(),
  };

  it('envía json_schema estricto, seed y temperature 0', async () => {
    const { crear, openai } = cliente([
      respuesta('2029-05-09'),
      respuesta('2029-05-09'),
    ]);
    await extraerFechasDocPersonal({ ...base, openai, seed: 42 });
    const params = (crear.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(params).toMatchObject({
      temperature: 0,
      seed: 42,
      model: 'gpt-4o-2024-11-20',
    });
    expect(params.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true },
    });
  });

  it('dos lecturas que coinciden → confianza alta, sin Revisar', async () => {
    const { crear, openai } = cliente([
      respuesta('2029-05-09'),
      respuesta('2029-05-09'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(2);
    expect(r.resultado.fechaVencimiento).toBe('2029-05-09');
    expect(r.resultado.confianza.fechaVencimiento).toBe('alta');
    expect(r.resultado.consenso?.fechaVencimiento.estado).toBe('unanime');
    expect(r.resultado.lecturasIa?.map((l) => [l.id, l.variante])).toEqual([
      ['ia1', 'normal'],
      ['ia2', 'alterna'],
    ]);
  });

  it('no coinciden → tercera lectura; la mayoría gana con confianza media', async () => {
    const { crear, openai } = cliente([
      respuesta('2029-05-09'),
      respuesta('2029-09-05'),
      respuesta('2029-05-09'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(3);
    expect(r.resultado.fechaVencimiento).toBe('2029-05-09');
    expect(r.resultado.confianza.fechaVencimiento).toBe('media');
    expect(r.resultado.consenso?.fechaVencimiento).toMatchObject({
      estado: 'mayoria',
    });
    expect(r.respuestasCrudas).toHaveLength(3);
  });

  it('tres lecturas distintas → la más probable, confianza baja y Revisar', async () => {
    const { openai } = cliente([
      respuesta('2029-05-09'),
      respuesta('2029-09-05'),
      respuesta('2030-05-09'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(r.resultado.confianza.fechaVencimiento).toBe('baja');
    expect(r.resultado.revisar).toBe(true);
    expect(r.resultado.motivosRevision?.join(' ')).toMatch(/no coinciden/);
  });

  it('la segunda lectura falla → se usa la primera, sin confianza alta y con Revisar', async () => {
    const { openai } = cliente([respuesta('2029-05-09'), 'no es json']);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(r.resultado.fechaVencimiento).toBe('2029-05-09');
    expect(r.resultado.confianza.fechaVencimiento).toBe('media');
    expect(r.resultado.revisar).toBe(true);
  });

  it('tipo equivocado con confianza alta → reextrae con las reglas del detectado', async () => {
    const pasaporte = (venc: string) =>
      respuesta(venc, { tipoDetectado: 'pasaporte', confianzaTipo: 'alta' });
    const { crear, openai } = cliente([
      pasaporte('2032-05-09'),
      pasaporte('2032-05-09'),
      pasaporte('2032-05-09'),
      pasaporte('2032-05-09'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(4);
    // La 3.ª llamada ya usa las reglas del pasaporte.
    const prompt = JSON.stringify((crear.mock.calls[2] as unknown[])[0]);
    expect(prompt).toContain(
      'TIPO DE DOCUMENTO QUE INDICÓ EL USUARIO: pasaporte',
    );
    expect(r.resultado.tipoSospechoso).toEqual({
      tipoElegido: 'visa',
      tipoDetectado: 'pasaporte',
    });
    expect(r.resultado.reextraccion).toEqual({
      tipoElegido: 'visa',
      tipoUsado: 'pasaporte',
    });
    expect(r.resultado.revisar).toBe(true);
  });

  it('tipo distinto con confianza media → no reextrae, solo marca tipoSospechoso', async () => {
    const otro = respuesta('2029-05-09', {
      tipoDetectado: 'pasaporte',
      confianzaTipo: 'media',
    });
    const { crear, openai } = cliente([otro, otro]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(2);
    expect(r.resultado.tipoSospechoso).toEqual({
      tipoElegido: 'visa',
      tipoDetectado: 'pasaporte',
    });
    expect(r.resultado.reextraccion).toBeNull();
  });
});

describe('formatoComprobado: documentos emitidos en EE. UU.', () => {
  const doc = { paginas: [{ numero: 1, texto: '', estructuradas: [] }] };
  it('paisEmisor US sin indicador escrito → mm/dd; MX o sin país → dd/mm', () => {
    const p = (paisEmisor: string | null) =>
      normalizarRespuesta({
        paisEmisor,
        fechaEmision: {
          valor: '2024-03-04',
          textoLiteral: '03/04/2024',
          confianza: 'alta',
        },
      });
    expect(formatoComprobado(doc, p('US'))).toBe('mm/dd/aaaa');
    expect(formatoComprobado(doc, p('MX'))).toBeNull();
    expect(formatoComprobado(doc, p(null))).toBeNull();
  });
});

describe('formatoComprobado y hayConflictoFormatoFechas: evidencia de otras fechas', () => {
  it('otra fecha del documento con día > 12 resuelve el formato sin país', () => {
    const doc = {
      paginas: [
        {
          numero: 1,
          texto:
            'Fecha de expedición: 03/04/2025\nFecha de vencimiento: 25/12/2030',
          estructuradas: [],
        },
      ],
    };
    expect(formatoComprobado(doc)).toBe('dd/mm/aaaa');
    expect(hayConflictoFormatoFechas(doc)).toBe(false);
  });

  it('fechas que implican ambos formatos: no se asume ninguno y se marca conflicto', () => {
    const doc = {
      paginas: [
        {
          numero: 1,
          texto: 'Documento 1: 25/12/2025\nDocumento 2: 12/25/2030',
          estructuradas: [],
        },
      ],
    };
    expect(formatoComprobado(doc)).toBeNull();
    expect(hayConflictoFormatoFechas(doc)).toBe(true);
  });
});

describe('requiereSegundaLectura', () => {
  it('siempre en documentos visuales (imagen o PDF escaneado)', () => {
    expect(requiereSegundaLectura('CURP', true, false)).toBe(true);
  });

  it('en PDF con texto, solo si la IA difiere de lo determinista...', () => {
    expect(requiereSegundaLectura('CURP', false, true)).toBe(true);
    expect(requiereSegundaLectura('CURP', false, false)).toBe(false);
  });

  it('...o si el tipo es pasaporte, visa o certificado médico (causa 5)', () => {
    expect(requiereSegundaLectura('pasaporte', false, false)).toBe(true);
    expect(requiereSegundaLectura('visa', false, false)).toBe(true);
    expect(requiereSegundaLectura('certificado_medico', false, false)).toBe(
      true,
    );
    // Otros tipos sensibles a vigencia (p. ej. INE) no están en la lista:
    // solo se agregó para los 3 tipos que pediste.
    expect(requiereSegundaLectura('INE', false, false)).toBe(false);
  });
});
