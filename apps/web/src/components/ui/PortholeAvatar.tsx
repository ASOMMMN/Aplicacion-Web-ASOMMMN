function getInitials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}

interface PortholeAvatarProps {
  nombre: string;
  size?: number;
  className?: string;
}

/**
 * Avatar de iniciales estilo "ojo de buey" (ventana de barco): doble
 * borde azul marino/dorado con remaches sutiles alrededor del borde.
 */
export function PortholeAvatar({ nombre, size = 44, className }: PortholeAvatarProps) {
  return (
    <span
      className={`porthole-avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      <span className="porthole-ring">
        <span className="porthole-face">{getInitials(nombre)}</span>
      </span>
    </span>
  );
}
