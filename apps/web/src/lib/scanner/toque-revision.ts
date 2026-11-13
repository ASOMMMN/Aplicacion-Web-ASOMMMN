import { CONFIG_ESCANER } from './constantes';

/**
 * true si un toque ocurre dentro de la ventana posterior a entrar a la
 * revisión y debe ignorarse. Tiempos en ms de `performance.now()`.
 */
export function toqueTrasEntrarARevision(
  ahora: number,
  entradaRevision: number,
  ventanaMs: number = CONFIG_ESCANER.ventanaToqueTrasRevisionMs,
): boolean {
  return ahora - entradaRevision < ventanaMs;
}
