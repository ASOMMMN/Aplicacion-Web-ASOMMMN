import { entregarDocumento, MENSAJE_ERROR_PDF, mensajeErrorSubida } from '../entrega';

describe('entregarDocumento', () => {
  it('genera el PDF y lo entrega', async () => {
    const generar = jest.fn().mockResolvedValue('pdf-1');
    const entregar = jest.fn().mockResolvedValue(undefined);

    const r = await entregarDocumento({ existente: null, generar, entregar });

    expect(r).toEqual({ ok: true, archivo: 'pdf-1' });
    expect(generar).toHaveBeenCalledTimes(1);
    expect(entregar).toHaveBeenCalledWith('pdf-1');
  });

  it('si falla la generación del PDF lo reporta como fase "pdf" y no intenta subir', async () => {
    const generar = jest.fn().mockRejectedValue(new Error('canvas'));
    const entregar = jest.fn();

    const r = await entregarDocumento({ existente: null, generar, entregar });

    expect(r).toEqual({ ok: false, fase: 'pdf', mensaje: MENSAJE_ERROR_PDF });
    expect(entregar).not.toHaveBeenCalled();
  });

  it('si falla la subida lo reporta como fase "subida", con el mensaje de la API y el PDF conservado', async () => {
    const generar = jest.fn().mockResolvedValue('pdf-1');
    const entregar = jest.fn().mockRejectedValue(new Error('Tipo de archivo no permitido'));

    const r = await entregarDocumento({ existente: null, generar, entregar });

    expect(r).toMatchObject({ ok: false, fase: 'subida', archivo: 'pdf-1' });
    expect(r.ok === false && r.mensaje).toContain('Tipo de archivo no permitido.');
    expect(r.ok === false && r.mensaje).toContain('reintentar');
    expect(r.ok === false && r.mensaje).not.toBe(MENSAJE_ERROR_PDF);
  });

  it('al reintentar reutiliza el PDF ya generado sin volver a generarlo', async () => {
    const generar = jest.fn().mockResolvedValue('pdf-nuevo');
    const entregar = jest.fn().mockResolvedValue(undefined);

    const r = await entregarDocumento({ existente: 'pdf-1', generar, entregar });

    expect(r).toEqual({ ok: true, archivo: 'pdf-1' });
    expect(generar).not.toHaveBeenCalled();
    expect(entregar).toHaveBeenCalledWith('pdf-1');
  });

  it('un segundo fallo de subida sigue conservando el mismo PDF', async () => {
    const entregar = jest.fn().mockRejectedValue(new Error('Sin conexión'));

    const r = await entregarDocumento({ existente: 'pdf-1', generar: jest.fn(), entregar });

    expect(r).toMatchObject({ ok: false, fase: 'subida', archivo: 'pdf-1' });
  });
});

describe('mensajeErrorSubida', () => {
  it('no duplica la puntuación final del detalle', () => {
    expect(mensajeErrorSubida(new Error('Demasiadas subidas.'))).toContain('Demasiadas subidas. Tus');
  });

  it('sin detalle usa un mensaje genérico', () => {
    expect(mensajeErrorSubida('cualquier cosa')).toMatch(/^No se pudo subir el documento\. Tus páginas/);
  });
});
