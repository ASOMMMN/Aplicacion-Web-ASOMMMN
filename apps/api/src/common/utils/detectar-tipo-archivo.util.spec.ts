import { detectarTipoArchivo } from './detectar-tipo-archivo.util';

describe('detectarTipoArchivo', () => {
  it('detecta un PDF real por su firma %PDF-', () => {
    const buffer = Buffer.from('%PDF-1.4\n...resto del archivo...');
    expect(detectarTipoArchivo(buffer)).toBe('application/pdf');
  });

  it('detecta un JPEG real por su firma', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectarTipoArchivo(buffer)).toBe('image/jpeg');
  });

  it('detecta un PNG real por su firma', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(detectarTipoArchivo(buffer)).toBe('image/png');
  });

  it('devuelve null para un archivo que no es ninguno de los tipos aceptados', () => {
    const buffer = Buffer.from('MZ\x90\x00esto-es-un-ejecutable-no-un-pdf');
    expect(detectarTipoArchivo(buffer)).toBeNull();
  });

  it('devuelve null para un .html disfrazado de PDF por su mimetype', () => {
    // El atacante pone mimetype "application/pdf" en el form-data, pero el
    // contenido real es HTML — el mimetype es solo lo que el cliente dice.
    const buffer = Buffer.from('<html><body>no soy un pdf</body></html>');
    expect(detectarTipoArchivo(buffer)).toBeNull();
  });

  it('devuelve null para un buffer vacío', () => {
    expect(detectarTipoArchivo(Buffer.alloc(0))).toBeNull();
  });

  it('devuelve null para un buffer más corto que la firma más larga', () => {
    expect(detectarTipoArchivo(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});
