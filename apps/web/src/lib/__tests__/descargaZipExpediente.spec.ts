import {
  MENSAJES_ZIP,
  ejecutarDescargaZip,
  guardarBlobComoArchivo,
  mensajeErrorDescargaZip,
  nombreDesdeContentDisposition,
  nombreZipRespaldo,
  resumirArchivosExpediente,
} from '../descargaZipExpediente';

const zip = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
const errorHttp = (status: number, data: unknown) => ({ response: { status, data } });
const blobJson = (obj: unknown) => new Blob([JSON.stringify(obj)], { type: 'application/json' });

describe('resumirArchivosExpediente', () => {
  it('cuenta solo archivos disponibles (con urlDescargar) de personales, cursos y CV', () => {
    const r = resumirArchivosExpediente({
      docsPersonales: [
        { archivos: [{ tamanio: 100, urlDescargar: 'x' }, { tamanio: 50 }] },
        { archivos: [] },
      ],
      cursos: [{ documentoExtra: { tamanio: 200, urlDescargar: 'y' } }, {}],
      cv: { tamanio: 30, urlDescargar: 'z' },
    });
    expect(r).toEqual({ total: 3, bytes: 330 });
  });

  it('sin datos cargados: 0 archivos (el botón queda deshabilitado)', () => {
    expect(resumirArchivosExpediente({ docsPersonales: null, cursos: null, cv: null })).toEqual({
      total: 0,
      bytes: 0,
    });
  });
});

describe('nombreDesdeContentDisposition', () => {
  it('prefiere filename* (UTF-8) y cae a filename', () => {
    expect(
      nombreDesdeContentDisposition(
        `attachment; filename="Documentos_PENA.zip"; filename*=UTF-8''Documentos_PE%C3%91A.zip`,
        'r.zip',
      ),
    ).toBe('Documentos_PEÑA.zip');
    expect(nombreDesdeContentDisposition('attachment; filename="a.zip"', 'r.zip')).toBe('a.zip');
  });

  it('limpia rutas y usa el respaldo si no hay cabecera legible (CORS)', () => {
    expect(nombreDesdeContentDisposition('attachment; filename="../../x/y.zip"', 'r.zip')).toBe('y.zip');
    expect(nombreDesdeContentDisposition(undefined, 'r.zip')).toBe('r.zip');
    expect(nombreDesdeContentDisposition("attachment; filename*=UTF-8''%E0%A4%A", 'r.zip')).toBe('r.zip');
  });

  it('nombreZipRespaldo usa APELLIDOS_NOMBRES y la fecha', () => {
    expect(nombreZipRespaldo('Peña Núñez', 'José', new Date(2026, 10, 9))).toBe(
      'Documentos_PENA_NUNEZ_JOSE_20261109.zip',
    );
  });
});

describe('mensajeErrorDescargaZip', () => {
  it('usa el mensaje del servidor aunque llegue como Blob (responseType blob)', async () => {
    const msg = 'El expediente es demasiado grande para descargarlo en un solo ZIP';
    await expect(mensajeErrorDescargaZip(errorHttp(422, blobJson({ message: msg })))).resolves.toBe(msg);
    await expect(
      mensajeErrorDescargaZip(errorHttp(429, { message: 'Demasiadas solicitudes' })),
    ).resolves.toBe('Demasiadas solicitudes');
  });

  it('sin respuesta (red caída o descarga cortada) da un mensaje de conexión', async () => {
    await expect(mensajeErrorDescargaZip(new Error('Network Error'))).resolves.toBe(MENSAJES_ZIP.sinConexion);
  });

  it('401/403 sin permiso; cuerpo ilegible: genérico', async () => {
    await expect(mensajeErrorDescargaZip(errorHttp(403, blobJson({ message: 'x' })))).resolves.toBe(
      MENSAJES_ZIP.sinPermiso,
    );
    await expect(mensajeErrorDescargaZip(errorHttp(500, new Blob(['<html>'])))).resolves.toBe(
      MENSAJES_ZIP.generico,
    );
  });
});

describe('guardarBlobComoArchivo', () => {
  it('usa <a download> insertado en el documento y revoca la URL después (Safari/Firefox)', () => {
    const enlace = { href: '', download: '', rel: '', style: { display: '' }, click: jest.fn(), remove: jest.fn() };
    const appendChild = jest.fn();
    const revokeObjectURL = jest.fn();
    let diferido: (() => void) | null = null;

    guardarBlobComoArchivo(zip(), 'Documentos.zip', {
      document: { createElement: () => enlace, body: { appendChild } } as never,
      URL: { createObjectURL: () => 'blob:abc', revokeObjectURL },
      setTimeout: (fn) => {
        diferido = fn;
      },
    });

    expect(enlace).toMatchObject({ href: 'blob:abc', download: 'Documentos.zip' });
    expect(appendChild).toHaveBeenCalledWith(enlace);
    expect(enlace.click).toHaveBeenCalled();
    expect(enlace.remove).toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled(); // no en el mismo tick
    diferido!();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:abc');
  });
});

describe('ejecutarDescargaZip', () => {
  it('guarda el ZIP con el nombre de la cabecera y no devuelve error', async () => {
    const guardar = jest.fn();
    const r = await ejecutarDescargaZip({
      obtener: async () => ({
        blob: zip(),
        contentType: 'application/zip',
        contentDisposition: 'attachment; filename="Documentos_X.zip"',
      }),
      nombreRespaldo: 'r.zip',
      guardar,
    });
    expect(r).toBeNull();
    expect(guardar).toHaveBeenCalledWith(expect.any(Blob), 'Documentos_X.zip');
  });

  it('no guarda nada si la respuesta no es un ZIP', async () => {
    const guardar = jest.fn();
    const r = await ejecutarDescargaZip({
      obtener: async () => ({ blob: new Blob(['<html>'], { type: 'text/html' }), contentType: 'text/html' }),
      nombreRespaldo: 'r.zip',
      guardar,
    });
    expect(r).toBe(MENSAJES_ZIP.respuestaInvalida);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('devuelve el mensaje en español si la API responde error', async () => {
    const r = await ejecutarDescargaZip({
      obtener: () => Promise.reject(errorHttp(404, blobJson({ message: 'Este aspirante todavía no tiene documentos para descargar.' }))),
      nombreRespaldo: 'r.zip',
      guardar: jest.fn(),
    });
    expect(r).toBe('Este aspirante todavía no tiene documentos para descargar.');
  });
});
