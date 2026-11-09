'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clasificarErrorCamara,
  RESTRICCIONES_CAMARA,
  RESTRICCIONES_CAMARA_MINIMAS,
  type FallaCamara,
} from '@/lib/scanner/camara';

export type EstadoCamara = 'iniciando' | 'lista' | 'error';

function detener(stream: MediaStream) {
  stream.getTracks().forEach((t) => t.stop());
}

async function abrir(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(RESTRICCIONES_CAMARA);
  } catch (err) {
    // Algunos equipos rechazan la resolución pedida: se reintenta solo con la cámara trasera.
    if ((err as { name?: string } | null)?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia(RESTRICCIONES_CAMARA_MINIMAS);
    }
    throw err;
  }
}

/**
 * Abre la cámara trasera en el <video> indicado mientras el componente está
 * montado y la apaga al desmontarse (se apaga también el indicador de
 * cámara del sistema). Las imágenes no salen del dispositivo.
 */
export function useCamara(escritorio = false) {
  /** Ref para el <video> del visor. */
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<EstadoCamara>('iniciando');
  const [falla, setFalla] = useState<FallaCamara | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    let stream: MediaStream | null = null;
    const v = video.current;

    const fallar = (err: unknown) => {
      if (cancelado) return;
      setFalla(clasificarErrorCamara(err, { escritorio }));
      setEstado('error');
    };

    void (async () => {
      try {
        const s = await abrir();
        if (cancelado || !v) {
          detener(s);
          return;
        }
        stream = s;
        s.getVideoTracks()[0]?.addEventListener('ended', () => fallar('detenida'));
        v.srcObject = s;
        try {
          // iOS exige muted + playsInline; autoPlay en el <video> cubre el resto.
          await v.play();
        } catch {
          /* AbortError si se cambia de paso a medio iniciar: no es una falla de la cámara. */
        }
        if (!cancelado) setEstado('lista');
      } catch (err) {
        fallar(err);
      }
    })();

    return () => {
      cancelado = true;
      if (stream) detener(stream);
      if (v) v.srcObject = null;
    };
  }, [intento, escritorio]);

  const reintentar = useCallback(() => {
    setFalla(null);
    setEstado('iniciando');
    setIntento((n) => n + 1);
  }, []);

  return { video, estado, falla, reintentar };
}
