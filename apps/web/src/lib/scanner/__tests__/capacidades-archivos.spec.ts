import { avisoLote, clasificarArchivos, esHeic, esImagen, esPdf, MENSAJE_PDF } from '../archivos';
import { clasificarErrorCamara } from '../camara';
import { clasificarDispositivo } from '../capacidades';
import { rectanguloCompleto } from '../geometria';
import { mejorarImagen } from '../mejora';

const UA = {
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
};

describe('clasificarDispositivo', () => {
  it('PC con mouse → escritorio', () => {
    expect(clasificarDispositivo({ userAgent: UA.windowsChrome, uaMobile: false, maxTouchPoints: 0, punteroFino: true })).toEqual({
      movil: false,
      tactil: false,
      escritorio: true,
    });
  });

  it('laptop táctil con trackpad sigue siendo escritorio', () => {
    const c = clasificarDispositivo({ userAgent: UA.windowsChrome, uaMobile: false, maxTouchPoints: 10, punteroFino: true });
    expect(c.escritorio).toBe(true);
    expect(c.tactil).toBe(true);
  });

  it('iPhone y Android → móvil, aunque la pantalla sea ancha', () => {
    expect(clasificarDispositivo({ userAgent: UA.iphone, maxTouchPoints: 5, punteroFino: false }).movil).toBe(true);
    expect(clasificarDispositivo({ userAgent: UA.android, uaMobile: true, maxTouchPoints: 5, punteroFino: false }).escritorio).toBe(false);
  });

  it('iPadOS se presenta como Macintosh pero es móvil', () => {
    const c = clasificarDispositivo({ userAgent: UA.macSafari, maxTouchPoints: 5, punteroFino: true });
    expect(c.movil).toBe(true);
    expect(c.escritorio).toBe(false);
  });

  it('Mac de escritorio (sin puntos táctiles) → escritorio', () => {
    expect(clasificarDispositivo({ userAgent: UA.macSafari, maxTouchPoints: 0, punteroFino: true }).escritorio).toBe(true);
  });

  it('tableta Android sin puntero fino → no es escritorio', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    expect(clasificarDispositivo({ userAgent: ua, uaMobile: false, maxTouchPoints: 10, punteroFino: false }).escritorio).toBe(false);
  });
});

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('archivos del escáner', () => {
  it('reconoce PDF, HEIC sin tipo MIME e imágenes', () => {
    expect(esPdf(f('cert.pdf', ''))).toBe(true);
    expect(esHeic(f('IMG_1.HEIC', ''))).toBe(true);
    expect(esImagen(f('IMG_1.HEIC', ''))).toBe(true);
    expect(esImagen(f('foto.webp', 'image/webp'))).toBe(true);
    expect(esImagen(f('notas.txt', 'text/plain'))).toBe(false);
  });

  it('separa imágenes, PDF, pesadas y las que no caben', () => {
    const c = clasificarArchivos(
      [
        f('a.jpg', 'image/jpeg', 50),
        f('b.pdf', 'application/pdf'),
        f('c.png', 'image/png', 500),
        f('d.png', 'image/png', 50),
        f('e.webp', 'image/webp', 50),
        f('x.txt', 'text/plain'),
      ],
      2,
      100,
    );
    expect(c.imagenes.map((i) => i.name)).toEqual(['a.jpg', 'd.png']);
    expect(c).toMatchObject({ pdfs: 1, otros: 1, pesadas: 1, sobrantes: 1 });

    const lleno = clasificarArchivos([f('a.jpg', 'image/jpeg', 50), f('b.jpg', 'image/jpeg', 500)], 0, 100);
    expect(lleno).toMatchObject({ imagenes: [], sobrantes: 1, pesadas: 1 });
  });

  it('el aviso explica qué hacer con un PDF y menciona el límite de páginas', () => {
    const texto = avisoLote({ sobrantes: 2, pesadas: 0, pdfs: 1, otros: 0 }, 1, 8)!;
    expect(texto).toContain('máximo es 8 páginas');
    expect(texto).toContain('no se pudo leer');
    expect(texto).toContain(MENSAJE_PDF);
    expect(avisoLote({ sobrantes: 0, pesadas: 0, pdfs: 0, otros: 0 }, 0, 8)).toBeNull();
  });
});

describe('Usar tal cual', () => {
  it('rectanguloCompleto cubre la imagen entera', () => {
    expect(rectanguloCompleto(400, 300)).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]);
  });

  it('el modo original devuelve los mismos píxeles en una COPIA (el worker transfiere el buffer)', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const img = { width: 2, height: 1, data };
    const r = mejorarImagen(img, 'original');
    expect(Array.from(r.data)).toEqual(Array.from(data));
    expect(r.data).not.toBe(data);
    expect(r.data.buffer).not.toBe(data.buffer);
  });
});

describe('mensajes de cámara en computadora', () => {
  it('hablan de webcam y de subir imágenes, no de la app del teléfono', () => {
    const m = clasificarErrorCamara({ name: 'NotAllowedError' }, { escritorio: true }).mensaje;
    expect(m).toMatch(/webcam/);
    expect(m).not.toMatch(/teléfono/);
    expect(clasificarErrorCamara({ name: 'NotFoundError' }, { escritorio: true }).mensaje).toMatch(/Sube imágenes/);
  });
});
