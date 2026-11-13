/**
 * Etiqueta del entorno a mostrar en la interfaz, según NEXT_PUBLIC_ENTORNO
 * (variable pública: se fija al compilar). Solo "staging" muestra la banda;
 * cualquier otro valor, o ninguno, es producción y no muestra nada.
 */
export function etiquetaEntorno(valor: string | undefined): string | null {
  return valor?.trim().toLowerCase() === 'staging' ? 'STAGING' : null;
}
