import {
  coincideAccept,
  formatearBytes,
  siguienteContador,
  tieneArchivos,
  validarSoltados,
  type EntradaSoltada,
} from '../validar';

const MB = 1024 * 1024;
const archivo = (name: string, type: string, size = 1024) => ({ name, type, size });
const entrada = (name: string, type: string, size = 1024, esCarpeta = false): EntradaSoltada<ReturnType<typeof archivo>> => ({
  archivo: archivo(name, type, size),
  esCarpeta,
});

const DOCS = { accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', maxSizeBytes: 20 * MB, etiquetaTipos: 'PDF, JPG o PNG' };

describe('coincideAccept', () => {
  it('acepta por extensión, tipo exacto o comodín, sin importar mayúsculas', () => {
    expect(coincideAccept(archivo('CV.PDF', ''), '.pdf')).toBe(true);
    expect(coincideAccept(archivo('x', 'image/png'), 'image/png')).toBe(true);
    expect(coincideAccept(archivo('x', 'image/webp'), 'image/*')).toBe(true);
    expect(coincideAccept(archivo('x.exe', 'application/x-msdownload'), '.pdf,image/*')).toBe(false);
  });
  it('sin accept acepta todo', () => {
    expect(coincideAccept(archivo('cualquier.cosa', ''), undefined)).toBe(true);
    expect(coincideAccept(archivo('cualquier.cosa', ''), '')).toBe(true);
  });
});

describe('validarSoltados', () => {
  it('acepta un PDF válido', () => {
    const r = validarSoltados([entrada('INE.pdf', 'application/pdf')], DOCS);
    expect(r.error).toBeNull();
    expect(r.aceptados).toHaveLength(1);
  });

  it('rechaza carpetas aunque su nombre parezca un archivo', () => {
    const r = validarSoltados([entrada('docs.pdf', '', 0, true)], DOCS);
    expect(r.aceptados).toHaveLength(0);
    expect(r.error).toMatch(/carpetas/i);
  });

  it('rechaza un tipo no permitido y dice cuáles sí', () => {
    const r = validarSoltados([entrada('virus.exe', 'application/x-msdownload')], DOCS);
    expect(r.aceptados).toHaveLength(0);
    expect(r.error).toContain('PDF, JPG o PNG');
  });

  it('rechaza un archivo sobre el límite y acepta uno justo en el límite', () => {
    const sobre = validarSoltados([entrada('g.pdf', 'application/pdf', 20 * MB + 1)], DOCS);
    expect(sobre.aceptados).toHaveLength(0);
    expect(sobre.error).toMatch(/máximo es 20 MB/);
    const justo = validarSoltados([entrada('g.pdf', 'application/pdf', 20 * MB)], DOCS);
    expect(justo.error).toBeNull();
  });

  it('rechaza archivos vacíos', () => {
    const r = validarSoltados([entrada('v.pdf', 'application/pdf', 0)], DOCS);
    expect(r.error).toMatch(/vacío/);
  });

  it('sin multiple, soltar dos archivos rechaza ambos', () => {
    const r = validarSoltados(
      [entrada('a.pdf', 'application/pdf'), entrada('b.pdf', 'application/pdf')],
      DOCS,
    );
    expect(r.aceptados).toHaveLength(0);
    expect(r.error).toMatch(/un solo archivo/);
  });

  it('con multiple, sube los válidos e informa de los rechazados', () => {
    const r = validarSoltados(
      [entrada('a.pdf', 'application/pdf'), entrada('b.exe', 'application/x-msdownload'), entrada('c.png', 'image/png')],
      { ...DOCS, multiple: true },
    );
    expect(r.aceptados.map((f) => f.name)).toEqual(['a.pdf', 'c.png']);
    expect(r.error).toContain('b.exe');
  });

  it('no hay error si no se soltó nada', () => {
    expect(validarSoltados([], DOCS)).toEqual({ aceptados: [], error: null });
  });
});

describe('formatearBytes', () => {
  it('usa KB o MB', () => {
    expect(formatearBytes(500)).toBe('1 KB');
    expect(formatearBytes(20 * MB)).toBe('20 MB');
    expect(formatearBytes(1.5 * MB)).toBe('1.5 MB');
  });
});

describe('tieneArchivos', () => {
  it('distingue archivos de texto o enlaces arrastrados', () => {
    expect(tieneArchivos({ types: ['Files'] })).toBe(true);
    expect(tieneArchivos({ types: ['text/plain', 'text/uri-list'] })).toBe(false);
    expect(tieneArchivos(null)).toBe(false);
  });
});

describe('siguienteContador (dragenter/dragleave)', () => {
  it('no termina de arrastrar al pasar de un hijo a otro', () => {
    let n = 0;
    n = siguienteContador(n, 'enter'); // entra a la zona
    n = siguienteContador(n, 'enter'); // entra a un hijo
    n = siguienteContador(n, 'leave'); // sale del padre hacia el hijo (dragleave del padre)
    expect(n).toBeGreaterThan(0);
    n = siguienteContador(n, 'leave'); // sale de verdad
    expect(n).toBe(0);
  });
  it('nunca baja de 0 y reset lo limpia', () => {
    expect(siguienteContador(0, 'leave')).toBe(0);
    expect(siguienteContador(3, 'reset')).toBe(0);
  });
});
