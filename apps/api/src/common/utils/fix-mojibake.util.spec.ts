import { corregirMojibakeLatin1 } from './fix-mojibake.util';

/**
 * Simula lo que busboy/multer produce: el navegador manda el nombre del
 * archivo como bytes UTF-8 en el header `Content-Disposition`, pero multer
 * decodifica ese header como Latin-1. Reproducimos eso tomando los bytes
 * UTF-8 del nombre correcto y reinterpretándolos como Latin-1.
 */
function simularMojibakeDeMulter(nombreCorrecto: string): string {
  return Buffer.from(nombreCorrecto, 'utf8').toString('latin1');
}

describe('corregirMojibakeLatin1', () => {
  it.each([
    ['MARÍA.pdf', 'MARÍA.pdf'],
    ['MÉDICO.pdf', 'MÉDICO.pdf'],
    ['Peña.pdf', 'Peña.pdf'],
    ['Ñandú.pdf', 'Ñandú.pdf'],
    [
      'Certificación Médica - José Muñoz.pdf',
      'Certificación Médica - José Muñoz.pdf',
    ],
  ])('repara el mojibake de "%s"', (nombreCorrecto) => {
    const mojibake = simularMojibakeDeMulter(nombreCorrecto);
    // Confirma que el caso de prueba realmente reproduce el bug (si no,
    // la entrada ya sería idéntica a la salida esperada y el test no
    // probaría nada).
    expect(mojibake).not.toBe(nombreCorrecto);

    expect(corregirMojibakeLatin1(mojibake)).toBe(nombreCorrecto);
  });

  it('no modifica nombres puramente ASCII', () => {
    expect(corregirMojibakeLatin1('reporte-final.pdf')).toBe(
      'reporte-final.pdf',
    );
  });

  it('normaliza a NFC (ej. un Mac que manda el nombre en NFD)', () => {
    // macOS suele enviar nombres de archivo en UTF-8 forma NFD ("e" +
    // acento agudo combinante, en vez de "é" precompuesto). Esos bytes
    // también se pierden en el mismo bug de multer/Latin-1, así que al
    // repararlos hay que normalizar a NFC para terminar con el mismo
    // resultado que un nombre NFC normal.
    const nfd = 'José.pdf'; // "e" + U+0301
    const nfc = 'José.pdf'; // "é" precompuesto
    expect(nfd).not.toBe(nfc);

    const mojibakeDesdeNfd = simularMojibakeDeMulter(nfd);
    expect(corregirMojibakeLatin1(mojibakeDesdeNfd)).toBe(nfc);
  });

  it('devuelve el original si la reinterpretación UTF-8 no es válida', () => {
    // Bytes que no forman una secuencia UTF-8 válida al reinterpretarlos
    // (p.ej. un nombre que genuinamente llegó en Latin-1 puro sin pasar
    // por el bug de multer). No debe corromperse con U+FFFD.
    const entrada = 'naïve-¿qué?.pdf';
    const resultado = corregirMojibakeLatin1(entrada);
    expect(resultado).not.toContain('�');
    expect(resultado).toBe(entrada);
  });

  it('maneja string vacío', () => {
    expect(corregirMojibakeLatin1('')).toBe('');
  });

  describe('caracteres fuera de Latin-1 (code point > U+00FF)', () => {
    const NOMBRES_FUERA_DE_LATIN1 = [
      'Informe — final.pdf', // em dash U+2014
      '“Reporte”.pdf', // comillas tipográficas U+201C/U+201D
      '😀.pdf', // emoji (par suplente) U+1F600
      'Łukasz.pdf', // U+0141, fuera de Latin-1 pero en Latin Extended-A
    ];

    it.each(NOMBRES_FUERA_DE_LATIN1)(
      'no altera "%s" aunque ya esté en UTF-8 correcto',
      (nombreCorrecto) => {
        // Si no hubiera protección, Buffer.from(valor, 'latin1') truncaría
        // estos code points a su byte bajo (p.ej. "—" -> 0x14), que es
        // ASCII válido pero un carácter totalmente distinto: no dispararía
        // la protección de "UTF-8 inválido" y corrompería el nombre en
        // silencio.
        expect(corregirMojibakeLatin1(nombreCorrecto)).toBe(nombreCorrecto);
      },
    );

    it.each(NOMBRES_FUERA_DE_LATIN1)(
      'aun así repara el mojibake real de "%s"',
      (nombreCorrecto) => {
        const mojibake = simularMojibakeDeMulter(nombreCorrecto);
        expect(mojibake).not.toBe(nombreCorrecto);
        expect(corregirMojibakeLatin1(mojibake)).toBe(nombreCorrecto);
      },
    );
  });
});
