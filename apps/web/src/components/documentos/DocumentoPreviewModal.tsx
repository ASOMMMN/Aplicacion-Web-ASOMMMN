'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import { formatearFechaConPrecision } from '@/lib/fechas';

export interface DocumentoPreviewData {
  /** URL para mostrar en el navegador (inline); S3 firmada u object URL de un blob. */
  url: string;
  mimeType: string | null;
}

/** Mensaje legible de un error de axios (message puede ser string o arreglo). */
function mensajeError(err: unknown, porDefecto: string): string {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  const texto = m && typeof m === 'object' && !Array.isArray(m) ? (m as { message?: unknown }).message : m;
  if (Array.isArray(texto)) return texto.join('. ');
  return typeof texto === 'string' && texto ? texto : porDefecto;
}

/**
 * Vista previa de un documento (PDF o imagen) sin forzar la descarga.
 * `cargar` se llama cada vez que se abre (y una vez más, automático, si
 * falla la primera) para que la URL firmada sea siempre fresca.
 */
export function DocumentoPreviewModal({
  show,
  onHide,
  titulo,
  nombreArchivo,
  fechaEmision,
  fechaVencimiento,
  cargar,
  onDescargar,
}: {
  show: boolean;
  onHide: () => void;
  /** Tipo de documento o nombre del curso/carpeta. */
  titulo: string;
  nombreArchivo: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  cargar: () => Promise<DocumentoPreviewData>;
  /** Si no se da, no se muestra el botón "Descargar". */
  onDescargar?: () => void;
}) {
  const [datos, setDatos] = useState<DocumentoPreviewData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const reintentadoRef = useRef(false);
  /** object URL (Mi Nube: blob del archivo) a liberar al reemplazarla o cerrar. */
  const objectUrlRef = useRef<string | null>(null);
  const liberarObjectUrl = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  const intentarCargar = async (esReintento = false) => {
    setCargando(true);
    setError('');
    if (!esReintento) setDatos(null);
    try {
      const r = await cargar();
      liberarObjectUrl();
      if (r.url.startsWith('blob:')) objectUrlRef.current = r.url;
      setDatos(r);
    } catch (err) {
      if (!esReintento) {
        // La URL firmada pudo expirar entre que se listó y se abrió el
        // modal: se regenera automáticamente una vez antes de mostrar error.
        reintentadoRef.current = true;
        return intentarCargar(true);
      }
      setDatos(null);
      setError(mensajeError(err, 'No se pudo cargar la vista previa.'));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!show) {
      liberarObjectUrl();
      return;
    }
    reintentadoRef.current = false;
    void intentarCargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir/cerrar.
  }, [show]);

  // Libera el object URL también si el modal se desmonta estando abierto.
  useEffect(() => () => liberarObjectUrl(), []);

  const esImagen = datos?.mimeType?.startsWith('image/');
  const esPdf = datos?.mimeType === 'application/pdf';

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title as="h6" className="text-truncate">
          {titulo}
          <div className="text-muted small fw-normal text-truncate">{nombreArchivo}</div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {cargando && (
          <div className="d-flex justify-content-center align-items-center py-5">
            <Spinner animation="border" size="sm" className="me-2" />
            <span className="text-muted small">Cargando vista previa…</span>
          </div>
        )}
        {!cargando && error && (
          <Alert variant="warning" className="small mb-0">
            {error}
            <div className="mt-2">
              <Button size="sm" variant="outline-secondary" onClick={() => void intentarCargar()}>
                <i className="bi bi-arrow-clockwise me-1" />
                Reintentar
              </Button>
            </div>
          </Alert>
        )}
        {!cargando && !error && datos && (
          <>
            {esPdf && (
              <iframe
                src={datos.url}
                title={nombreArchivo}
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            )}
            {!esPdf && esImagen && (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada externa (S3) u object URL de un blob. */}
                <img
                  src={datos.url}
                  alt={nombreArchivo}
                  style={{ maxWidth: '100%', maxHeight: '70vh' }}
                  onError={() => {
                    if (reintentadoRef.current) {
                      setError('No se pudo cargar la imagen (la URL pudo expirar).');
                      setDatos(null);
                    } else {
                      reintentadoRef.current = true;
                      void intentarCargar(true);
                    }
                  }}
                />
              </div>
            )}
            {!esPdf && !esImagen && (
              <Alert variant="secondary" className="small mb-0">
                Vista previa no disponible para este tipo de archivo.
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        <div className="small text-muted">
          {fechaEmision && <span className="me-3">Emisión: {formatearFechaConPrecision(fechaEmision)}</span>}
          {fechaVencimiento && <span>Vencimiento: {formatearFechaConPrecision(fechaVencimiento)}</span>}
        </div>
        <div className="d-flex gap-2">
          {onDescargar && (
            <Button variant="outline-primary" size="sm" onClick={onDescargar}>
              <i className="bi bi-download me-1" />
              Descargar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onHide}>
            Cerrar
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
