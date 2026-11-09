'use client';

import { useCallback, useRef, useState } from 'react';
import type { ClienteEscaner } from '@/lib/scanner/cliente';
import { imageDataAJpeg } from '@/lib/scanner/lienzo';
import type { Cuadrilatero, ModoMejora, Rotacion } from '@/lib/scanner/tipos';

/**
 * Calidad con la que se guarda cada página procesada mientras se edita. Es
 * alta a propósito: la compresión final (ver CONFIG_ESCANER) vuelve a
 * codificar desde aquí y no conviene acumular pérdidas.
 */
const CALIDAD_INTERMEDIA = 0.95;

export interface PaginaProcesada {
  jpeg: Blob;
  ancho: number;
  alto: number;
}

/**
 * Endereza y mejora la página cargada en el procesador. Si el usuario
 * cambia de modo varias veces seguidas, solo cuenta el último resultado.
 */
export function useMejoraImagen(cliente: () => ClienteEscaner) {
  const [procesando, setProcesando] = useState(false);
  const turno = useRef(0);

  const procesar = useCallback(
    async (
      esquinas: Cuadrilatero,
      modo: ModoMejora,
      rotacion: Rotacion,
    ): Promise<PaginaProcesada | null> => {
      const mio = ++turno.current;
      setProcesando(true);
      try {
        const img = await cliente().procesar(esquinas, modo, rotacion);
        if (mio !== turno.current) return null;
        const jpeg = await imageDataAJpeg(img, CALIDAD_INTERMEDIA);
        return mio === turno.current ? { jpeg, ancho: img.width, alto: img.height } : null;
      } finally {
        if (mio === turno.current) setProcesando(false);
      }
    },
    [cliente],
  );

  return { procesar, procesando };
}
