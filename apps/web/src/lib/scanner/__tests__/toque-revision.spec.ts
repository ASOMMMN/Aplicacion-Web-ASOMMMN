import { CONFIG_ESCANER } from '../constantes';
import { toqueTrasEntrarARevision } from '../toque-revision';

describe('toqueTrasEntrarARevision', () => {
  const entrada = 10_000;

  it('la ventana por defecto es de ~500 ms', () => {
    expect(CONFIG_ESCANER.ventanaToqueTrasRevisionMs).toBe(500);
  });

  it.each([0, 1, 120, 499])('un toque a los %i ms de entrar se ignora', (ms) => {
    expect(toqueTrasEntrarARevision(entrada + ms, entrada)).toBe(true);
  });

  it.each([500, 501, 1500, 60_000])('un toque a los %i ms ya cuenta', (ms) => {
    expect(toqueTrasEntrarARevision(entrada + ms, entrada)).toBe(false);
  });

  it('respeta una ventana distinta', () => {
    expect(toqueTrasEntrarARevision(entrada + 200, entrada, 100)).toBe(false);
    expect(toqueTrasEntrarARevision(entrada + 50, entrada, 100)).toBe(true);
  });
});
