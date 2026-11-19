import type OpenAI from 'openai';
import { extraerFechasDocPersonal } from './extraer-fechas-doc-personal';
import type { DocumentoLeido } from './lectura-documento';

/**
 * I-01 (AUDITORIA.md): la llamada de respaldo a la Responses API (PDF que no
 * se pudo renderizar) debe pedir `store: false`; si no, OpenAI guarda la
 * respuesta por defecto. Se intercepta `fetch`: no sale nada a la red.
 */

const PDF_CRUDO: DocumentoLeido = {
  modo: 'pdf-crudo',
  texto: '',
  imagenes: [],
  paginasTotales: 1,
  paginasLeidas: 1,
  paginas: [{ numero: 1, texto: '', escaneada: true, estructuradas: [] }],
};

describe('extraerFechasDocPersonal: respaldo con Responses API (I-01)', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          output_text: JSON.stringify({ fechaVencimiento: null }),
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('envía store: false en cada llamada a /v1/responses', async () => {
    // Si se usara el SDK (ruta de visión), la prueba debe fallar.
    const crearCompletion = jest
      .fn()
      .mockRejectedValue(new Error('no debía llamarse'));
    const openai = {
      chat: { completions: { create: crearCompletion } },
    } as unknown as OpenAI;

    await extraerFechasDocPersonal({
      buffer: Buffer.from('%PDF-1.4 documento sintético'),
      mimeType: 'application/pdf',
      tipo: 'pasaporte',
      apiKey: 'sk-test',
      modelo: 'gpt-4o-2024-11-20',
      openai,
      documentoLeido: PDF_CRUDO,
      onError: () => undefined,
      dormir: () => Promise.resolve(),
    });

    expect(fetchMock).toHaveBeenCalled();
    for (const [url, init] of fetchMock.mock.calls as [
      string,
      { body: string },
    ][]) {
      expect(url).toBe('https://api.openai.com/v1/responses');
      const cuerpo = JSON.parse(init.body) as Record<string, unknown>;
      expect(cuerpo.store).toBe(false);
      expect(cuerpo).not.toHaveProperty('previous_response_id');
    }
    expect(crearCompletion).not.toHaveBeenCalled();
  });
});
