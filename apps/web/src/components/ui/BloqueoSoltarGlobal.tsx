'use client';

import { useEffect } from 'react';
import { tieneArchivos } from '@/lib/dropzone/validar';

/**
 * Si se suelta un archivo fuera de una zona de subida, el navegador lo abre
 * y reemplaza la página (se pierde la sesión de trabajo y lo que se estaba
 * llenando). Este bloqueo, montado una sola vez en el layout raíz, cancela el
 * comportamiento por defecto fuera de cualquier [data-dropzone]; dentro de
 * ellas decide el DropZone.
 */
export function BloqueoSoltarGlobal() {
  useEffect(() => {
    const fueraDeZona = (e: DragEvent) => {
      if (!tieneArchivos(e.dataTransfer)) return;
      const destino = e.target instanceof Element ? e.target : null;
      if (destino?.closest('[data-dropzone]')) return;
      e.preventDefault();
      if (e.dataTransfer && e.type === 'dragover') e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', fueraDeZona);
    window.addEventListener('drop', fueraDeZona);
    return () => {
      window.removeEventListener('dragover', fueraDeZona);
      window.removeEventListener('drop', fueraDeZona);
    };
  }, []);

  return null;
}
