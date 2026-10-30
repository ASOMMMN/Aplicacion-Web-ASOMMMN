/**
 * Lista de destinatarios permitidos (EMAIL_ALLOWLIST), pensada para staging:
 * separada por comas; cada entrada es un correo completo (ana@ejemplo.com) o un
 * dominio (ejemplo.com o @ejemplo.com). Un dominio permite solo ese dominio, no
 * sus subdominios (para eso se lista el subdominio). Sin distinguir mayúsculas.
 *
 * Valor ausente o vacío = sin restricción (el comportamiento de producción).
 */
export type ListaCorreos = { correos: Set<string>; dominios: Set<string> };

const CORREO =
  /^[^\s@,]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DOMINIO =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Devuelve null si no hay restricción; lanza un Error si alguna entrada es inválida. */
export function parsearListaCorreos(
  valor: string | undefined,
): ListaCorreos | null {
  const crudo = (valor ?? '').trim();
  if (!crudo) return null;

  const lista: ListaCorreos = { correos: new Set(), dominios: new Set() };
  crudo.split(',').forEach((elemento, i) => {
    const entrada = elemento.trim().toLowerCase();
    if (!entrada) {
      throw new Error(
        `EMAIL_ALLOWLIST inválida (elemento ${i + 1}): hay un elemento vacío; revisa comas de más o al final.`,
      );
    }
    if (entrada.includes('*')) {
      throw new Error(
        `EMAIL_ALLOWLIST inválida (elemento ${i + 1}: "${entrada}"): no se permiten comodines (*).`,
      );
    }
    if (entrada.includes('@') && !entrada.startsWith('@')) {
      if (!CORREO.test(entrada)) {
        throw new Error(
          `EMAIL_ALLOWLIST inválida (elemento ${i + 1}: "${entrada}"): no es un correo válido.`,
        );
      }
      lista.correos.add(entrada);
      return;
    }
    const dominio = entrada.replace(/^@/, '');
    if (!DOMINIO.test(dominio)) {
      throw new Error(
        `EMAIL_ALLOWLIST inválida (elemento ${i + 1}: "${entrada}"): no es un correo ni un dominio válido.`,
      );
    }
    lista.dominios.add(dominio);
  });
  return lista;
}

/** true si la lista no restringe (null) o si el destinatario está en ella. */
export function destinatarioPermitido(
  destinatario: string,
  lista: ListaCorreos | null,
): boolean {
  if (!lista) return true;
  const correo = (destinatario ?? '').trim().toLowerCase();
  const arroba = correo.lastIndexOf('@');
  if (arroba < 1) return false;
  return (
    lista.correos.has(correo) || lista.dominios.has(correo.slice(arroba + 1))
  );
}
