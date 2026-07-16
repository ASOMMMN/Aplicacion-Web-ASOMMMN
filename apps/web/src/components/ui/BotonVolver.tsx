'use client';

import { useRouter } from 'next/navigation';

interface BotonVolverProps {
  className?: string;
  fallbackHref?: string;
}

export function BotonVolver({ className = '', fallbackHref = '/dashboard' }: BotonVolverProps) {
  const router = useRouter();

  const handleVolver = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      className={`btn btn-outline-secondary btn-sm ${className}`.trim()}
      onClick={handleVolver}
    >
      ‹ Volver
    </button>
  );
}
