'use client';

import { useCallback, useState } from 'react';
import type { ClienteEscaner } from '@/lib/scanner/cliente';
import { comprimirPaginas } from '@/lib/scanner/compresion';
import { CONFIG_ESCANER } from '@/lib/scanner/constantes';
import { recodificarJpeg } from '@/lib/scanner/lienzo';
import { nombreArchivoEscaneo } from '@/lib/scanner/pdf';
import type { PaginaProcesada } from './useMejoraImagen';

export interface ProgresoPdf {
  /** 0–100 */
  porcentaje: number;
  mensaje: string;
}

/**
 * Comprime las páginas (calidad/peso según CONFIG_ESCANER) y arma el PDF.
 * Devuelve un `File` listo para el flujo de subida existente.
 */
export function useGeneradorPdf(cliente: () => ClienteEscaner) {
  const [progreso, setProgreso] = useState<ProgresoPdf | null>(null);

  const generar = useCallback(
    async (paginas: readonly PaginaProcesada[], etiqueta: string): Promise<File> => {
      setProgreso({ porcentaje: 5, mensaje: 'Optimizando páginas…' });
      try {
        const conDimensiones = paginas.map((p) => ({ ...p, width: p.ancho, height: p.alto }));
        const comprimido = await comprimirPaginas(
          conDimensiones,
          (p, calidad, escala) => recodificarJpeg(p.jpeg, calidad, escala),
          CONFIG_ESCANER,
          (intento) =>
            setProgreso({
              porcentaje: Math.min(80, 5 + intento * 15),
              mensaje: intento === 1 ? 'Optimizando páginas…' : 'Reduciendo el tamaño del archivo…',
            }),
        );
        setProgreso({ porcentaje: 85, mensaje: 'Generando PDF…' });
        const bytes = await cliente().generarPdf(
          comprimido.jpgs.map((jpg, i) => ({ jpg, anchoPx: paginas[i].ancho, altoPx: paginas[i].alto })),
          { dpi: CONFIG_ESCANER.dpiPdf, titulo: `${etiqueta} (escaneo)` },
        );
        setProgreso({ porcentaje: 100, mensaje: 'Listo' });
        return new File([bytes as BlobPart], nombreArchivoEscaneo(etiqueta), {
          type: 'application/pdf',
          lastModified: Date.now(),
        });
      } finally {
        setProgreso(null);
      }
    },
    [cliente],
  );

  return { generar, progreso };
}
