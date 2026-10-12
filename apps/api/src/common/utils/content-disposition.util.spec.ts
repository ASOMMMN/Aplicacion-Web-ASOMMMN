import { construirContentDisposition } from './content-disposition.util';

describe('construirContentDisposition', () => {
  it.each(['MARÍA.pdf', 'MÉDICO.pdf', 'Peña.pdf', 'Ñandú.pdf'])(
    'incluye filename y filename* UTF-8 para "%s"',
    (nombre) => {
      const header = construirContentDisposition('attachment', nombre);

      expect(header).toContain(`filename="${nombre}"`);
      expect(header).toContain(
        `filename*=UTF-8''${encodeURIComponent(nombre)}`,
      );
      expect(header.startsWith('attachment;')).toBe(true);
    },
  );

  it('usa el tipo de disposición indicado (inline)', () => {
    const header = construirContentDisposition('inline', 'Peña.pdf');
    expect(header.startsWith('inline;')).toBe(true);
  });

  it('escapa comillas dobles en el fallback filename', () => {
    const header = construirContentDisposition('attachment', 'a"b.pdf');
    expect(header).toContain(`filename="a'b.pdf"`);
  });
});
