'use client';

/**
 * Punto de entrada del escáner. Se carga con next/dynamic (sin SSR): el
 * código del escáner, sus estilos, el worker y pdf-lib solo se descargan
 * cuando el usuario lo abre, no en la carga inicial de las páginas.
 */
import dynamic from 'next/dynamic';
import type { DocumentScannerProps } from './DocumentScanner';

export type { DocumentScannerProps };

export const DocumentScanner = dynamic<DocumentScannerProps>(() => import('./DocumentScanner'), {
  ssr: false,
});

/**
 * El escáner necesita canvas y createImageBitmap (el Worker es opcional:
 * sin él procesa en el hilo principal). Sin ellos se ofrece solo la
 * subida tradicional.
 */
export function escanerDisponible(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}
