const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

function esParticula(palabra: string): boolean {
  return PARTICULAS.has(palabra.toLowerCase());
}

/**
 * Iniciales a partir del primer nombre + primer apellido, ignorando
 * partículas (de, del, la, las, los, y). Si se conocen `nombre` y
 * `apellidos` por separado, cada uno aporta su primera palabra
 * significativa (ej. "María de los Ángeles" + "de la Cruz" -> "MC").
 *
 * Sin esa separación (un solo string con nombre completo), no hay forma
 * confiable de saber dónde termina el nombre y empieza el apellido — el
 * fallback solo puede asumir que la 1a palabra es el nombre y buscar la
 * siguiente palabra no-partícula como apellido, lo que puede fallar con
 * nombres compuestos largos (ej. "María de los Ángeles Galván").
 */
function getInitials(nombre: string, apellidos?: string): string {
  if (apellidos && apellidos.trim()) {
    const palabrasNombre = nombre.trim().split(/\s+/).filter(Boolean);
    const palabrasApellidos = apellidos.trim().split(/\s+/).filter(Boolean);
    const inicial1 = palabrasNombre[0]?.[0] ?? '';
    const inicial2 =
      palabrasApellidos.find((p) => !esParticula(p))?.[0] ??
      palabrasApellidos[0]?.[0] ??
      '';
    const initials = `${inicial1}${inicial2}`.toUpperCase();
    return initials || '?';
  }

  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  const inicial1 = palabras[0][0];
  const siguiente = palabras.slice(1).find((p) => !esParticula(p));
  const initials = `${inicial1}${siguiente?.[0] ?? ''}`.toUpperCase();
  return initials || '?';
}

interface PortholeAvatarProps {
  /** Nombre(s) de pila, o nombre completo si no se tiene `apellidos` por separado. */
  nombre: string;
  /** Apellido(s), por separado. Si se da, las iniciales son exactas. */
  apellidos?: string;
  size?: number;
  className?: string;
}

/**
 * Avatar de iniciales estilo "ojo de buey" (ventana de barco): doble
 * borde azul marino/dorado con remaches sutiles alrededor del borde.
 */
export function PortholeAvatar({ nombre, apellidos, size = 44, className }: PortholeAvatarProps) {
  return (
    <span
      className={`porthole-avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      <span className="porthole-ring">
        <span className="porthole-face">{getInitials(nombre, apellidos)}</span>
      </span>
    </span>
  );
}
