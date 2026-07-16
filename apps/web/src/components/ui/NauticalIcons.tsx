interface IconProps {
  size?: number;
  className?: string;
}

/**
 * bootstrap-icons no incluye un glifo de ancla ni de timón, así que estos
 * dos se resuelven como SVG simples heredando color vía `currentColor`.
 */
export function IconAncla({ size = 18, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2" />
      <line x1="12" y1="7" x2="12" y2="21" />
      <path d="M6 11h12" />
      <path d="M4.5 12c0 4.2 3.2 7.8 7.5 9c4.3-1.2 7.5-4.8 7.5-9" />
    </svg>
  );
}

export function IconTimon({ size = 18, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <line x1="12" y1="1.5" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22.5" y2="12" />
      <line x1="4.6" y1="4.6" x2="7.5" y2="7.5" />
      <line x1="16.5" y1="16.5" x2="19.4" y2="19.4" />
      <line x1="4.6" y1="19.4" x2="7.5" y2="16.5" />
      <line x1="16.5" y1="7.5" x2="19.4" y2="4.6" />
    </svg>
  );
}

export function IconBarco({ size = 18, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 16l1.5 4.2a2 2 0 0 0 1.9 1.3h11.2a2 2 0 0 0 1.9-1.3L21 16" />
      <path d="M5 16l1-8h12l1 8" />
      <line x1="12" y1="8" x2="12" y2="2.5" />
      <path d="M12 2.5h4.5L12 6.5z" />
    </svg>
  );
}

/** Timón girando continuamente — reemplaza al Spinner genérico de Bootstrap. */
export function SpinnerTimon({ size = 40, className }: IconProps) {
  return (
    <IconTimon
      size={size}
      className={`spin-timon${className ? ` ${className}` : ''}`}
    />
  );
}
