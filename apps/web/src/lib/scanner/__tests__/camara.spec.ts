import { camaraEnVivoDisponible, clasificarErrorCamara, dimensionesCaptura } from '../camara';

const error = (name: string) => Object.assign(new Error('x'), { name });

describe('clasificarErrorCamara', () => {
  it.each(['NotAllowedError', 'PermissionDeniedError', 'SecurityError'])(
    '%s → permiso denegado, permanente y con salida a la app de cámara',
    (nombre) => {
      const f = clasificarErrorCamara(error(nombre));
      expect(f.tipo).toBe('denegado');
      expect(f.permanente).toBe(true);
      expect(f.reintentable).toBe(true);
      expect(f.mensaje).toMatch(/app de cámara/);
    },
  );

  it.each(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'])('%s → sin cámara, no reintentable', (nombre) => {
    const f = clasificarErrorCamara(error(nombre));
    expect(f.tipo).toBe('sin-camara');
    expect(f.reintentable).toBe(false);
    expect(f.permanente).toBe(true);
  });

  it.each(['NotReadableError', 'TrackStartError', 'AbortError'])('%s → cámara ocupada, reintentable', (nombre) => {
    const f = clasificarErrorCamara(error(nombre));
    expect(f.tipo).toBe('ocupada');
    expect(f.reintentable).toBe(true);
    expect(f.permanente).toBe(false);
  });

  it('la transmisión detenida se puede reintentar', () => {
    const f = clasificarErrorCamara('detenida');
    expect(f.tipo).toBe('detenida');
    expect(f.reintentable).toBe(true);
    expect(f.permanente).toBe(false);
  });

  it.each([null, undefined, 42, {}, error('TypeError')])('cualquier otro error → desconocido (%p)', (valor) => {
    expect(clasificarErrorCamara(valor).tipo).toBe('desconocido');
  });
});

describe('dimensionesCaptura', () => {
  it('reduce al lado largo máximo conservando la proporción', () => {
    expect(dimensionesCaptura(2560, 1440, 2400)).toEqual({ ancho: 2400, alto: 1350 });
    expect(dimensionesCaptura(1440, 2560, 2400)).toEqual({ ancho: 1350, alto: 2400 });
  });

  it('nunca agranda un fotograma más chico', () => {
    expect(dimensionesCaptura(1280, 720, 2400)).toEqual({ ancho: 1280, alto: 720 });
  });
});

describe('camaraEnVivoDisponible', () => {
  it('es false fuera del navegador (sin window)', () => {
    expect(camaraEnVivoDisponible()).toBe(false);
  });
});
