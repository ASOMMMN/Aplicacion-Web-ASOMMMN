import {
  detectarTipoArchivo,
  tipoParaGuardar,
  TIPO_DESCONOCIDO,
} from './detectar-tipo-archivo.util';

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

describe('tipoParaGuardar', () => {
  it('usa la firma real aunque el cliente diga otra cosa', () => {
    expect(tipoParaGuardar(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(tipoParaGuardar(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(
      'image/jpeg',
    );
  });

  it('reconoce GIF y WEBP para conservar su vista previa', () => {
    expect(tipoParaGuardar(Buffer.from('GIF89a\x01\x00'))).toBe('image/gif');
    expect(
      tipoParaGuardar(Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')),
    ).toBe('image/webp');
  });

  it('lo no reconocido (HTML, Office, texto) se guarda como application/octet-stream', () => {
    expect(
      tipoParaGuardar(Buffer.from('<html><script>x</script></html>')),
    ).toBe(TIPO_DESCONOCIDO);
    expect(tipoParaGuardar(Buffer.from('PK\x03\x04docx', 'latin1'))).toBe(
      TIPO_DESCONOCIDO,
    );
    expect(tipoParaGuardar(Buffer.alloc(0))).toBe(TIPO_DESCONOCIDO);
  });

  it('no amplía lo que acepta detectarTipoArchivo', () => {
    expect(detectarTipoArchivo(Buffer.from('GIF89a\x01\x00'))).toBeNull();
  });
});
