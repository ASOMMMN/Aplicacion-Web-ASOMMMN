'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Modal, ProgressBar, Table } from 'react-bootstrap';
import api from '@/lib/api/client';
import { formatearFechaCalendario } from '@/lib/fechas';
import { mensajeError } from './CorregirFechasModal';
import type { EstadoExtraccion } from './types';

/** Respuesta de GET /pendientes-analisis y POST /:id/reanalizar. */
export interface ResultadoAnalisisDoc {
  docId: string;
  tipo: string;
  label: string;
  nombreOriginal: string;
  extraccionEstado: EstadoExtraccion;
  extraccionError: string | null;
  fechaEmision: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  revisarFechas: boolean;
  fechasVerificadas: boolean;
  /** No se pudo analizar ahora (límite por minuto de OpenAI); el documento no cambió. */
  aviso?: string;
  limitePorMinuto?: boolean;
}

type Fila = ResultadoAnalisisDoc & { fase: 'espera' | 'analizando' | 'listo' | 'fallo'; fallo?: string };

export function DescripcionResultado({ r }: { r: ResultadoAnalisisDoc }) {
  if (r.extraccionEstado === 'error') {
    return <span className="text-danger">Error: {r.extraccionError}</span>;
  }
  if (r.extraccionEstado === 'sin_fechas') {
    return <span className="text-secondary">Sin fechas encontradas</span>;
  }
  if (r.extraccionEstado === 'pendiente') {
    return <span className="text-secondary">No analizado</span>;
  }
  const partes = [
    r.fechaEmision && `emisión ${formatearFechaCalendario(r.fechaEmision)}`,
    r.fechaInicio && `inicio ${formatearFechaCalendario(r.fechaInicio)}`,
    r.fechaVencimiento && `vence ${formatearFechaCalendario(r.fechaVencimiento)}`,
  ].filter(Boolean);
  return (
    <span className="text-success">
      {partes.join(' · ')}
      {r.revisarFechas && <span className="badge bg-warning-subtle text-warning-emphasis border ms-1">Revisar</span>}
    </span>
  );
}

/**
 * Botón de la tarjeta "Resumen de fechas": analiza, uno por uno, los
 * documentos personales del postulante que no tienen fechas (nunca
 * analizados, con error o sin fechas en un tipo que vence).
 */
export function AnalizarPendientesCandidato({
  postulanteId,
  onTerminado,
}: {
  postulanteId: string;
  onTerminado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState('');
  const detener = useRef(false);

  const abrir = async () => {
    setAbierto(true);
    setFilas(null);
    setError('');
    try {
      const { data } = await api.get<ResultadoAnalisisDoc[]>(
        `/docs-personales/postulante/${postulanteId}/pendientes-analisis`,
      );
      setFilas(data.map((d) => ({ ...d, fase: 'espera' })));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo obtener la lista de documentos.'));
    }
  };

  const analizar = async () => {
    if (!filas) return;
    setCorriendo(true);
    setError('');
    detener.current = false;
    const actualizar = (i: number, cambio: Partial<Fila>) =>
      setFilas((fs) => fs && fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

    for (let i = 0; i < filas.length; i++) {
      if (detener.current) break;
      actualizar(i, { fase: 'analizando' });
      try {
        const { data } = await api.post<ResultadoAnalisisDoc>(
          `/docs-personales/${filas[i].docId}/reanalizar`,
        );
        actualizar(i, { ...data, fase: 'listo' });
      } catch (err) {
        const msg = mensajeError(err, 'No se pudo analizar.');
        actualizar(i, { fase: 'fallo', fallo: msg });
        // Límite de tasa: los siguientes también fallarían.
        if ((err as { response?: { status?: number } })?.response?.status === 429) {
          setError(msg);
          break;
        }
      }
    }
    setCorriendo(false);
    onTerminado();
  };

  const hechos = filas?.filter((f) => f.fase === 'listo' || f.fase === 'fallo').length ?? 0;
  const total = filas?.length ?? 0;

  return (
    <>
      <Button variant="outline-primary" size="sm" onClick={abrir}>
        <i className="bi bi-stars me-1" />
        Analizar documentos pendientes
      </Button>

      <Modal show={abierto} onHide={() => !corriendo && setAbierto(false)} size="lg" centered>
        <Modal.Header closeButton={!corriendo}>
          <Modal.Title as="h6">Analizar documentos pendientes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
          {!filas && !error && <p className="small text-muted mb-0">Buscando documentos…</p>}
          {filas && total === 0 && (
            <p className="small mb-0">No hay documentos pendientes: todos tienen fechas, están verificados o no las muestran.</p>
          )}
          {filas && total > 0 && (
            <>
              <p className="small mb-2">
                {corriendo || hechos > 0
                  ? `Procesados ${hechos} de ${total}.`
                  : `Se analizarán ${total} documento(s), uno por uno. Las fechas verificadas por un evaluador no se cambian.`}
              </p>
              {(corriendo || hechos > 0) && (
                <ProgressBar now={(hechos / total) * 100} className="mb-3" style={{ height: 8 }} />
              )}
              <Table size="sm" className="small mb-0">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Antes</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.docId}>
                      <td>
                        {f.label}
                        <div className="text-muted text-truncate" style={{ maxWidth: 220, fontSize: '0.7rem' }} title={f.nombreOriginal}>
                          {f.nombreOriginal}
                        </div>
                      </td>
                      <td className="text-muted">
                        {f.fase === 'espera' || f.fase === 'analizando' ? <DescripcionResultado r={f} /> : '—'}
                      </td>
                      <td>
                        {f.fase === 'espera' && <span className="text-muted">En espera</span>}
                        {f.fase === 'analizando' && <span className="text-primary">Analizando…</span>}
                        {f.fase === 'listo' &&
                          (f.limitePorMinuto ? (
                            <span className="text-warning-emphasis">{f.aviso}</span>
                          ) : (
                            <DescripcionResultado r={f} />
                          ))}
                        {f.fase === 'fallo' && <span className="text-danger">{f.fallo}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {corriendo ? (
            <Button variant="outline-danger" size="sm" onClick={() => (detener.current = true)}>
              Detener
            </Button>
          ) : (
            <>
              <Button variant="outline-secondary" size="sm" onClick={() => setAbierto(false)}>
                Cerrar
              </Button>
              {filas && total > 0 && hechos === 0 && (
                <Button variant="primary" size="sm" onClick={analizar}>
                  Analizar {total} documento(s)
                </Button>
              )}
            </>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}
