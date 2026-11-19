'use client';

import { useCallback, useEffect, useRef } from 'react';
import { crearClienteEscaner, type ClienteEscaner } from '@/lib/scanner/cliente';

/**
 * Cliente del escáner ligado al ciclo de vida del componente: el worker se
 * crea al usarlo por primera vez y se termina al desmontar.
 */
export function useClienteEscaner(): () => ClienteEscaner {
  const ref = useRef<ClienteEscaner | null>(null);

  useEffect(
    () => () => {
      ref.current?.cerrar();
      ref.current = null;
    },
    [],
  );

  return useCallback(() => {
    if (!ref.current) ref.current = crearClienteEscaner();
    return ref.current;
  }, []);
}
