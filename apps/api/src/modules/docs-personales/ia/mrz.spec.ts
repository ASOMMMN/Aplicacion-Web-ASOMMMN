import { digitoVerificador, leerMrz } from './mrz';

/** 2.ª línea TD3 sintética (sin datos reales) con dígitos verificadores correctos. */
function lineaTd3(vencimiento: string, nacimiento = '900101'): string {
  const doc = 'G12345678';
  const linea =
    doc +
    digitoVerificador(doc) +
    'MEX' +
    nacimiento +
    digitoVerificador(nacimiento) +
    'F' +
    vencimiento +
    digitoVerificador(vencimiento) +
    '<'.repeat(14) +
    '0';
  return linea + '0';
}

describe('digitoVerificador', () => {
  it('ejemplos de ICAO 9303', () => {
    expect(digitoVerificador('L898902C3')).toBe(6);
    expect(digitoVerificador('740812')).toBe(2);
    expect(digitoVerificador('120415')).toBe(9);
  });
});

describe('leerMrz', () => {
  it('pasaporte TD3 (espécimen ICAO): vencimiento AAMMDD → 20xx', () => {
    const mrz = [
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
    ].join('\n');
    expect(leerMrz(mrz)).toMatchObject({
      vencimiento: '2012-04-15',
      formato: 'TD3',
    });
  });

  it('vencimiento siempre 20xx; el nacimiento (19xx) se ignora', () => {
    const r = leerMrz(lineaTd3('271219', '850315'));
    expect(r?.vencimiento).toBe('2027-12-19');
  });

  it('acepta la línea con espacios (como la copia el modelo)', () => {
    const linea = lineaTd3('300131');
    const conEspacios = `${linea.slice(0, 20)} ${linea.slice(20)}`;
    expect(leerMrz(conEspacios)?.vencimiento).toBe('2030-01-31');
  });

  it('dígito verificador incorrecto → null (lectura dudosa)', () => {
    const linea = lineaTd3('271219');
    const mala = linea.slice(0, 27) + ((+linea[27] + 1) % 10) + linea.slice(28);
    expect(leerMrz(mala)).toBeNull();
  });

  it('TD1 (credencial, espécimen ICAO)', () => {
    const mrz = [
      'I<UTOD231458907<<<<<<<<<<<<<<<',
      '7408122F1204159UTO<<<<<<<<<<<6',
      'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
    ].join('\n');
    expect(leerMrz(mrz)).toMatchObject({
      vencimiento: '2012-04-15',
      formato: 'TD1',
    });
  });

  it('texto sin MRZ → null', () => {
    expect(leerMrz('Fecha de caducidad 19 DIC 2027')).toBeNull();
    expect(leerMrz(null)).toBeNull();
  });
});
