import { etiquetaEntorno } from '../entorno';

describe('etiquetaEntorno', () => {
  it.each(['staging', 'STAGING', ' Staging '])('%p muestra la etiqueta', (valor) => {
    expect(etiquetaEntorno(valor)).toBe('STAGING');
  });

  it.each([undefined, '', '  ', 'production', 'produccion', 'staging-2', 'true', '1'])(
    '%p es producción: no muestra nada',
    (valor) => {
      expect(etiquetaEntorno(valor)).toBeNull();
    },
  );
});
