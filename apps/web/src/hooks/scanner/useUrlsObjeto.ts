'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * URLs `blob:` para mostrar imágenes del escáner. Todas se revocan al
 * desmontar, para no dejar fotos de documentos en memoria.
 */
export function useUrlsObjeto() {
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const activas = urls.current;
    return () => {
      for (const u of activas) URL.revokeObjectURL(u);
      activas.clear();
    };
  }, []);

  const crear = useCallback((blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.add(u);
    return u;
  }, []);

  const revocar = useCallback((u: string | null | undefined) => {
    if (!u || !urls.current.has(u)) return;
    URL.revokeObjectURL(u);
    urls.current.delete(u);
  }, []);

  return { crear, revocar };
}
