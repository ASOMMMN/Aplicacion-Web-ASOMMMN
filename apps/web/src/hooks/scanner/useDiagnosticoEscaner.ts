'use client';

import { useEffect, useRef } from 'react';

/**
 * TEMPORAL — diagnóstico del bug "tras Continuar el escáner regresó a la
 * pantalla de captura" (docs/escaner-pruebas-manuales.md, sección 6).
 * Quitar junto con su llamada en DocumentScanner cuando se confirme la causa.
 *
 * Registra en consola (`[escaner-diag]`) cada cambio de paso con el tiempo
 * desde el anterior y cada clic/toque sobre un botón, con su etiqueta y el
 * tiempo desde el último cambio de paso. Solo guarda nombres de pasos y
 * etiquetas de botones de la interfaz: ningún dato del postulante ni de las
 * fotos. Las últimas 40 líneas quedan en `window.__escanerDiag`.
 */
export function useDiagnosticoEscaner(paso: string) {
  const ultimoCambio = useRef(0);
  const pasoAnterior = useRef<string | null>(null);

  const registrar = (texto: string) => {
    const linea = `${new Date().toISOString().slice(11, 23)} ${texto}`;
    console.debug('[escaner-diag]', linea);
    const w = window as unknown as { __escanerDiag?: string[] };
    w.__escanerDiag = [...(w.__escanerDiag ?? []).slice(-39), linea];
  };

  useEffect(() => {
    if (pasoAnterior.current === null) ultimoCambio.current = performance.now();
    const ahora = performance.now();
    registrar(`paso ${pasoAnterior.current ?? '(inicio)'} → ${paso} (+${Math.round(ahora - ultimoCambio.current)} ms)`);
    pasoAnterior.current = paso;
    ultimoCambio.current = ahora;
  }, [paso]);

  useEffect(() => {
    const alClic = (e: Event) => {
      const boton = (e.target as HTMLElement | null)?.closest?.('button');
      if (!boton) return;
      const etiqueta = (boton.textContent ?? '').trim().slice(0, 40) || boton.getAttribute('aria-label') || '(sin etiqueta)';
      registrar(
        `${e.type} en "${etiqueta}"${boton.disabled ? ' [deshabilitado]' : ''} a ${Math.round(performance.now() - ultimoCambio.current)} ms del último cambio de paso`,
      );
    };
    document.addEventListener('click', alClic, true);
    return () => {
      document.removeEventListener('click', alClic, true);
      registrar('escáner desmontado');
    };
  }, []);
}
