'use client';

import { useCallback, useState } from 'react';
import type { ClienteEscaner } from '@/lib/scanner/cliente';
import type { ResultadoDeteccion } from '@/lib/scanner/tipos';

/**
 * Carga la foto en el procesador y busca los bordes del documento. Nunca
 * falla: ante error o demora, devuelve el rectángulo de respaldo.
 */
export function useDeteccionBordes(cliente: () => ClienteEscaner) {
  const [detectando, setDetectando] = useState(false);

  const detectar = useCallback(
    async (foto: ImageData): Promise<ResultadoDeteccion> => {
      setDetectando(true);
      try {
        await cliente().cargar(foto);
        return await cliente().detectar();
      } finally {
        setDetectando(false);
      }
    },
    [cliente],
  );

  return { detectar, detectando };
}
