import {
  MENSAJE_IA_ARCHIVO_GRANDE,
  MENSAJE_IA_LIMITE,
  MENSAJE_IA_SIN_CONEXION,
  mensajeErrorExtraerIa,
} from '../mensajeExtraerIa';

const http = (status: number, message?: unknown) => ({ response: { status, data: { message } } });

describe('mensajeErrorExtraerIa', () => {
  it('429: explica que se alcanzó el límite, no que falló la conexión', () => {
    const m = mensajeErrorExtraerIa(http(429, 'Has alcanzado el límite de análisis con IA.'));
    expect(m).toBe(MENSAJE_IA_LIMITE);
    expect(m).not.toBe(MENSAJE_IA_SIN_CONEXION);
    expect(m).toContain('manualmente');
  });

  it('sin respuesta del servidor (red caída, CORS, timeout) conserva el mensaje de conexión', () => {
    expect(mensajeErrorExtraerIa(new Error('Network Error'))).toBe(MENSAJE_IA_SIN_CONEXION);
    expect(mensajeErrorExtraerIa({ response: undefined })).toBe(MENSAJE_IA_SIN_CONEXION);
    expect(mensajeErrorExtraerIa(undefined)).toBe(MENSAJE_IA_SIN_CONEXION);
  });

  it('400: muestra lo que dice la API y sigue ofreciendo la captura manual', () => {
    const m = mensajeErrorExtraerIa(http(400, 'Documento extra inválido. Sube un PDF, JPG o PNG.'));
    expect(m).toBe('Documento extra inválido. Sube un PDF, JPG o PNG. Ingresa los datos manualmente.');
  });

  it('400: agrega el punto final si la API no lo trae y acepta listas de mensajes', () => {
    expect(mensajeErrorExtraerIa(http(400, 'Archivo inválido'))).toBe(
      'Archivo inválido. Ingresa los datos manualmente.',
    );
    expect(mensajeErrorExtraerIa(http(400, ['a', 'b']))).toBe('a, b. Ingresa los datos manualmente.');
  });

  it('413: indica el límite de tamaño en español', () => {
    expect(mensajeErrorExtraerIa(http(413, 'File too large'))).toBe(MENSAJE_IA_ARCHIVO_GRANDE);
  });

  it('400 sin mensaje y otros códigos (500, 502…) usan un texto genérico con el código', () => {
    expect(mensajeErrorExtraerIa(http(400))).toBe('La lectura con IA falló (error 400). Ingresa los datos manualmente.');
    expect(mensajeErrorExtraerIa(http(500, 'Internal server error'))).toBe(
      'La lectura con IA falló (error 500). Ingresa los datos manualmente.',
    );
  });

  it('no muestra mensajes técnicos de errores 5xx', () => {
    expect(mensajeErrorExtraerIa(http(500, 'MongoServerError: E11000'))).not.toContain('Mongo');
  });
});
