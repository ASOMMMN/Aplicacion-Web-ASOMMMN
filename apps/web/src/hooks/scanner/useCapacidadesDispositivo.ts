'use client';

import { useEffect, useState } from 'react';
import {
  clasificarDispositivo,
  contarCamaras,
  leerSenalesDispositivo,
  type CapacidadesDispositivo,
} from '@/lib/scanner/capacidades';

/**
 * Capacidades del dispositivo y cuántas cámaras tiene (null mientras no se
 * sabe o si el navegador no lo informa). Se actualiza si se conecta o
 * desconecta una webcam. Solo para componentes que se montan en el cliente
 * (el escáner se carga sin SSR).
 */
export function useCapacidadesDispositivo(): CapacidadesDispositivo & { camaras: number | null } {
  const [capacidades] = useState(() => clasificarDispositivo(leerSenalesDispositivo()));
  const [camaras, setCamaras] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const contar = () => {
      void contarCamaras().then((n) => {
        if (vivo) setCamaras(n);
      });
    };
    contar();
    const medios = navigator.mediaDevices;
    medios?.addEventListener?.('devicechange', contar);
    return () => {
      vivo = false;
      medios?.removeEventListener?.('devicechange', contar);
    };
  }, []);

  return { ...capacidades, camaras };
}
