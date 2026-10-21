const CONECTORES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'en',
  'el',
  'a',
  'al',
]);

/**
 * Capitalización de título en español: cada palabra significativa inicia
 * en mayúscula; los conectores (de, del, la, las, los, y, en, el, a, al)
 * quedan en minúscula salvo que sean la primera o última palabra.
 * Preserva acentos (toUpperCase/slice funcionan bien con unicode).
 *
 * Usado para normalizar ciudad, país y vacante al guardar el perfil del
 * postulante (ver postulantes.service.ts#actualizarPerfil).
 */
export function capitalizarTitulo(texto: string): string {
  const palabras = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '';

  return palabras
    .map((palabra, idx) => {
      const esPrimeraOUltima = idx === 0 || idx === palabras.length - 1;
      if (!esPrimeraOUltima && CONECTORES.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ');
}

/**
 * Minúsculas + sin acentos/diacríticos, para comparar texto de forma
 * insensible a mayúsculas y acentos (ej. búsqueda `q` de candidatos:
 * "Jose" debe encontrar "José").
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
