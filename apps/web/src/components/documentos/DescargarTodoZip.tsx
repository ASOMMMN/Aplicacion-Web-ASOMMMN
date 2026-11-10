'use client';

import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Card } from 'react-bootstrap';
import { IconAncla, SpinnerTimon } from '@/components/ui/NauticalIcons';
import {
  MENSAJES_ZIP,
  RespuestaZip,
  UMBRAL_AVISO_BYTES,
  ejecutarDescargaZip,
  formatearMB,
} from '@/lib/descargaZipExpediente';

export interface DescargarTodoZipVistaProps {
  totalArchivos: number;
  bytesEstimados: number;
  preparando: boolean;
  error: string | null;
  onDescargar: () => void;
  onCerrarError: () => void;
}

/** Vista sin estado (se prueba aislada): tarjeta con el botón, el resumen y el error. */
export function DescargarTodoZipVista({
  totalArchivos,
  bytesEstimados,
  preparando,
  error,
  onDescargar,
  onCerrarError,
}: DescargarTodoZipVistaProps) {
  const sinDocumentos = totalArchivos === 0;
  const pesado = bytesEstimados > UMBRAL_AVISO_BYTES;
  return (
    <Card className="card-asommmn card-asommmn-top-dorado mb-4">
      <Card.Body className="py-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <IconAncla size={17} className="nautical-icon flex-shrink-0" />
            <div style={{ minWidth: 0 }}>
              <div className="fw-semibold">Documentos del aspirante</div>
              <div className="text-muted small" aria-live="polite">
                {sinDocumentos
                  ? MENSAJES_ZIP.sinDocumentos
                  : `${totalArchivos} archivo${totalArchivos === 1 ? '' : 's'} · ~${formatearMB(bytesEstimados)} · personales, cursos y CV`}
              </div>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="flex-shrink-0"
            onClick={onDescargar}
            disabled={sinDocumentos || preparando}
            aria-busy={preparando}
            title={sinDocumentos ? MENSAJES_ZIP.sinDocumentos : 'Descarga un ZIP con todos los documentos que subió el aspirante'}
            data-testid="btn-descargar-todo-zip"
          >
            {preparando ? (
              <>
                <SpinnerTimon size={14} className="me-1" />
                Preparando descarga…
              </>
            ) : (
              <>
                <i className="bi bi-file-earmark-zip me-1" aria-hidden="true" />
                Descargar todo (ZIP)
              </>
            )}
          </Button>
        </div>
        {preparando && pesado && (
          <div className="text-muted small mt-2">
            El expediente pesa más de {formatearMB(UMBRAL_AVISO_BYTES)}; puede tardar varios minutos. No cierres esta pestaña.
          </div>
        )}
        {error && (
          <Alert variant="danger" className="mt-3 mb-0 py-2 small" dismissible onClose={onCerrarError}>
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
            {error}
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
}

export interface DescargarTodoZipProps {
  totalArchivos: number;
  bytesEstimados: number;
  nombreRespaldo: string;
  /** Petición autenticada al endpoint (la página usa el cliente axios con Bearer). */
  obtenerZip: () => Promise<RespuestaZip>;
}

/** "Descargar todo (ZIP)" del expediente, para evaluador y administrador. */
export function DescargarTodoZip({
  totalArchivos,
  bytesEstimados,
  nombreRespaldo,
  obtenerZip,
}: DescargarTodoZipProps) {
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enCurso = useRef(false);

  const descargar = useCallback(async () => {
    if (enCurso.current) return; // doble clic
    enCurso.current = true;
    setPreparando(true);
    setError(null);
    try {
      setError(await ejecutarDescargaZip({ obtener: obtenerZip, nombreRespaldo }));
    } finally {
      enCurso.current = false;
      setPreparando(false);
    }
  }, [obtenerZip, nombreRespaldo]);

  return (
    <DescargarTodoZipVista
      totalArchivos={totalArchivos}
      bytesEstimados={bytesEstimados}
      preparando={preparando}
      error={error}
      onDescargar={descargar}
      onCerrarError={() => setError(null)}
    />
  );
}
