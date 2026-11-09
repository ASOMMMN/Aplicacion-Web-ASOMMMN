'use client';

import { useEffect, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { useCamara } from '@/hooks/scanner/useCamara';
import { CONFIG_ESCANER } from '@/lib/scanner/constantes';
import { ErrorImagen, fotogramaAJpeg } from '@/lib/scanner/lienzo';
import estilos from './escaner.module.css';

/** Calidad del fotograma capturado; después se endereza y se comprime para el PDF. */
const CALIDAD_CAPTURA = 0.92;

interface Props {
  /** Foto tomada (JPEG): sigue el mismo camino que una foto elegida de la galería. */
  onCaptura: (foto: Blob) => void;
  onCancelar: () => void;
  /** Abre la app de cámara del sistema (<input capture>). Se llama dentro del toque: iOS lo exige. */
  onUsarAppCamara: () => void;
  onGaleria: () => void;
  /** La cámara en vivo no sirve en esta sesión (permiso negado o sin cámara): no volver a ofrecerla. */
  onNoDisponible: () => void;
  /** Computadora: es la webcam, no hay app de cámara y la alternativa es subir imágenes. */
  escritorio?: boolean;
}

/** Visor de la cámara trasera con obturador. Al desmontarse apaga la cámara. */
export function CamaraEnVivo({ onCaptura, onCancelar, onUsarAppCamara, onGaleria, onNoDisponible, escritorio = false }: Props) {
  const { video, estado, falla, reintentar } = useCamara(escritorio);
  const [capturando, setCapturando] = useState(false);
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null);

  useEffect(() => {
    if (falla?.permanente) onNoDisponible();
  }, [falla, onNoDisponible]);

  const capturar = async () => {
    const v = video.current;
    if (!v || estado !== 'lista' || capturando) return;
    setCapturando(true);
    setErrorCaptura(null);
    try {
      const foto = await fotogramaAJpeg(v, CONFIG_ESCANER.ladoMaxEntrada, CALIDAD_CAPTURA);
      onCaptura(foto);
    } catch (err) {
      setErrorCaptura(err instanceof ErrorImagen ? err.message : 'No se pudo tomar la foto. Intenta de nuevo.');
      setCapturando(false);
    }
  };

  return (
    <div className={estilos.camara}>
      <div className={estilos.visor}>
        <video
          ref={video}
          className={estilos.video}
          autoPlay
          muted
          playsInline
          aria-label={escritorio ? 'Vista de la webcam' : 'Vista de la cámara trasera'}
        />

        {estado === 'iniciando' && (
          <div className={estilos.visorVelo} role="status" aria-live="polite">
            <Spinner animation="border" variant="light" />
            <div>Abriendo la cámara…</div>
            <div className="small opacity-75">Si el navegador lo pide, toca “Permitir”.</div>
          </div>
        )}

        {estado === 'error' && falla && (
          <div className={estilos.visorVelo} role="alert">
            <i className={`bi ${falla.tipo === 'denegado' ? 'bi-camera-video-off' : 'bi-exclamation-triangle'} fs-2`} aria-hidden="true" />
            <p className="mb-1 small">{falla.mensaje}</p>
            <div className="d-grid gap-2 w-100" style={{ maxWidth: 320 }}>
              {!escritorio && falla.tipo !== 'sin-camara' && (
                <Button variant="dorado" onClick={onUsarAppCamara}>
                  <i className="bi bi-camera-fill me-2" aria-hidden="true" />
                  Usar la app de cámara
                </Button>
              )}
              <Button variant="light" onClick={onGaleria}>
                <i className="bi bi-images me-2" aria-hidden="true" />
                {escritorio ? 'Subir imágenes' : 'Elegir de la galería'}
              </Button>
              {falla.reintentable && (
                <Button variant="outline-light" onClick={reintentar}>
                  <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                  Reintentar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {errorCaptura && <p className="small text-danger mb-0 text-center">{errorCaptura}</p>}
      {estado === 'lista' && (
        <p className="small text-muted mb-0 text-center">
          {escritorio
            ? 'Acerca el documento a la webcam, completo y con buena luz.'
            : 'Encuadra el documento completo, con buena luz y sin reflejos.'}
        </p>
      )}

      <div className={estilos.controles}>
        <Button variant="outline-secondary" onClick={onCancelar} disabled={capturando}>
          Cancelar
        </Button>
        <button
          type="button"
          className={estilos.obturador}
          onClick={() => void capturar()}
          disabled={estado !== 'lista' || capturando}
          aria-label="Tomar foto"
        >
          {capturando && <Spinner animation="border" size="sm" />}
        </button>
        <Button variant="outline-primary" onClick={onGaleria} disabled={capturando}>
          <i className="bi bi-images me-1" aria-hidden="true" />
          {escritorio ? 'Imágenes' : 'Galería'}
        </Button>
      </div>
    </div>
  );
}
