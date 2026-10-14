import { celdaCsvSegura, filaCsvSegura } from './csv.util';

describe('celdaCsvSegura', () => {
  it('deja intacto un texto normal', () => {
    expect(celdaCsvSegura('María Galván')).toBe('María Galván');
  });

  it('neutraliza una celda que empieza con = (inyección de fórmula)', () => {
    // El valor con el apóstrofo antepuesto todavía tiene comillas internas,
    // así que además se envuelve en comillas y esas comillas se duplican
    // (regla estándar de CSV) — el apóstrofo es lo que neutraliza la fórmula.
    expect(celdaCsvSegura('=HYPERLINK("http://evil.com","click")')).toBe(
      '"\'=HYPERLINK(""http://evil.com"",""click"")"',
    );
  });

  it('neutraliza celdas que empiezan con +, -, @, tab o retorno de carro', () => {
    expect(celdaCsvSegura('+1234')).toBe("'+1234");
    expect(celdaCsvSegura('-cmd')).toBe("'-cmd");
    expect(celdaCsvSegura('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(celdaCsvSegura('\tmalicioso')).toBe("'\tmalicioso");
  });

  it('escapa comillas dobles duplicándolas y envolviendo en comillas', () => {
    expect(celdaCsvSegura('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it('envuelve en comillas si contiene una coma', () => {
    expect(celdaCsvSegura('Veracruz, México')).toBe('"Veracruz, México"');
  });

  it('envuelve en comillas si contiene un salto de línea', () => {
    expect(celdaCsvSegura('línea1\nlínea2')).toBe('"línea1\nlínea2"');
  });

  it('aplica primero el prefijo anti-fórmula y luego, si hace falta, las comillas', () => {
    expect(celdaCsvSegura('=A1,B1')).toBe('"\'=A1,B1"');
  });

  it('celda vacía se mantiene vacía', () => {
    expect(celdaCsvSegura('')).toBe('');
  });
});

describe('filaCsvSegura', () => {
  it('une las celdas escapadas con coma', () => {
    expect(filaCsvSegura(['Nombre', 'Veracruz, México', '=cmd'])).toBe(
      'Nombre,"Veracruz, México",\'=cmd',
    );
  });
});
