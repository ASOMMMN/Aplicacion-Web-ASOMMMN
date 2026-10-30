import {
  destinatarioPermitido,
  parsearListaCorreos,
} from './email-allowlist.util';

describe('parsearListaCorreos', () => {
  it.each([undefined, '', '   '])('%p = sin restricción', (valor) => {
    expect(parsearListaCorreos(valor)).toBeNull();
  });

  it('separa correos y dominios, sin importar mayúsculas ni espacios', () => {
    const l = parsearListaCorreos(
      ' Ana@Ejemplo.test , @equipo.test, otro.test ',
    );
    expect([...l!.correos]).toEqual(['ana@ejemplo.test']);
    expect([...l!.dominios]).toEqual(['equipo.test', 'otro.test']);
  });

  it.each([
    ['*', /comodines/],
    ['*@ejemplo.test', /comodines/],
    ['@*.ejemplo.test', /comodines/],
    ['ana@', /correo ni un dominio|correo válido/],
    ['ana@ejemplo', /correo válido/],
    ['no es correo', /correo ni un dominio/],
    ['ejemplo', /correo ni un dominio/],
    ['a@ejemplo.test,,b@ejemplo.test', /elemento vacío/],
    ['a@ejemplo.test,', /elemento vacío/],
  ])('rechaza %p', (valor, mensaje) => {
    expect(() => parsearListaCorreos(valor)).toThrow(mensaje);
  });
});

describe('destinatarioPermitido', () => {
  const lista = parsearListaCorreos('ana@ejemplo.test,equipo.test');

  it('sin lista (null): permite todo', () => {
    expect(destinatarioPermitido('cualquiera@x.test', null)).toBe(true);
  });

  it.each([
    ['ana@ejemplo.test', true],
    ['ANA@Ejemplo.TEST', true],
    ['luis@equipo.test', true],
    ['luis@EQUIPO.test', true],
    ['luis@ejemplo.test', false], // mismo dominio que una dirección, pero no listado
    ['ana@mail.equipo.test', false], // subdominio: no entra por el dominio
    ['luis@equipo.test.intruso.test', false],
    ['intruso@evil-equipo.test', false],
    ['sin-arroba', false],
    ['', false],
    ['@equipo.test', false],
  ])('%p -> %p', (destinatario, esperado) => {
    expect(destinatarioPermitido(destinatario, lista)).toBe(esperado);
  });
});
