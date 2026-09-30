'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Container, ProgressBar, Row, Spinner, Table } from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { mensajeError } from '@/components/resumen-fechas/CorregirFechasModal';
import {
  DescripcionResultado,
  type ResultadoAnalisisDoc,
} from '@/components/resumen-fechas/AnalizarPendientesCandidato';

/** GET /docs-personales/analisis-global */
interface EstadoAnalisisGlobal {
  enCurso: boolean;
  pendientesAhora: number;
  total: number;
  procesados: number;
  correctos: number;
  sinFechas: number;
  errores: number;
  iniciadoEn: string | null;
  iniciadoPor: string | null;
  finalizadoEn: string | null;
  motivoFin: string | null;
  recientes: ResultadoAnalisisDoc[];
  /** Límite por minuto de OpenAI: el análisis espera y continúa solo. */
  pausa: { hasta: string; motivo: string } | null;
}

const BASE = '/docs-personales/analisis-global';

function Contador({ valor, etiqueta, className }: { valor: number; etiqueta: string; className?: string }) {
  return (
    <Col xs={6} md={3}>
      <Card className="shadow-sm h-100">
        <Card.Body className="py-3">
          <div className={`h4 fw-bold mb-0 ${className ?? ''}`}>{valor}</div>
          <div className="small text-muted">{etiqueta}</div>
        </Card.Body>
      </Card>
    </Col>
  );
}

/**
 * Análisis de fechas de los documentos personales de todos los postulantes
 * (estado "pendiente" o "error"), en segundo plano en el servidor.
 */
export default function AnalisisDocumentosPage() {
  const [estado, setEstado] = useState<EstadoAnalisisGlobal | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<EstadoAnalisisGlobal>(BASE);
      setEstado(data);
      setError('');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo consultar el estado del análisis.'));
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    api
      .get<EstadoAnalisisGlobal>(BASE)
      .then(({ data }) => {
        if (!cancelado) setEstado(data);
      })
      .catch((err) => {
        if (!cancelado) setError(mensajeError(err, 'No se pudo consultar el estado del análisis.'));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Mientras corre, se consulta el progreso cada 3 s.
  useEffect(() => {
    if (!estado?.enCurso) return;
    const t = setInterval(() => void cargar(), 3000);
    return () => clearInterval(t);
  }, [estado?.enCurso, cargar]);

  const iniciar = async () => {
    if (!estado) return;
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Analizar documentos pendientes',
      html: `Se analizarán <b>${estado.pendientesAhora}</b> documento(s) en estado "pendiente" o "error" de todos los postulantes, por lotes y con pausa entre llamadas a OpenAI.<br/><br/>Las fechas verificadas por un evaluador no se cambian.`,
      showCancelButton: true,
      confirmButtonText: 'Iniciar',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    setEnviando(true);
    try {
      const { data } = await api.post<EstadoAnalisisGlobal>(`${BASE}/iniciar`);
      setEstado(data);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo iniciar el análisis.'));
    } finally {
      setEnviando(false);
    }
  };

  const detener = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post<EstadoAnalisisGlobal>(`${BASE}/detener`);
      setEstado(data);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo detener el análisis.'));
    } finally {
      setEnviando(false);
    }
  };

  const pct = estado && estado.total > 0 ? Math.round((estado.procesados / estado.total) * 100) : 0;
  const huboAnalisis = Boolean(estado?.iniciadoEn);

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container fluid>
        <Row className="align-items-end g-3 mb-4">
          <Col lg={8}>
            <Badge bg="dark" className="mb-2">Administración</Badge>
            <h1 className="h3 fw-bold mb-1">Análisis de documentos personales</h1>
            <p className="text-muted mb-0">
              Extrae con IA las fechas de emisión y vencimiento de los documentos que nunca se analizaron o cuyo
              análisis falló, de todos los postulantes.
            </p>
          </Col>
          <Col lg={4} className="d-flex gap-2 justify-content-lg-end">
            <Button variant="outline-secondary" size="sm" onClick={() => void cargar()}>
              Actualizar
            </Button>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="shadow-sm" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {!estado ? (
          !error && (
            <div className="d-flex justify-content-center py-5">
              <Spinner />
            </div>
          )
        ) : (
          <>
            <Card className="shadow-sm mb-4">
              <Card.Body className="d-flex flex-wrap align-items-center gap-3">
                <div className="me-auto">
                  {estado.enCurso ? (
                    <>
                      <div className="fw-semibold">
                        <Spinner size="sm" className="me-2" />
                        Analizando… {estado.procesados} de {estado.total}
                      </div>
                      <div className="small text-muted">
                        Iniciado por {estado.iniciadoPor}. Puedes cerrar esta página: el análisis sigue en el servidor.
                      </div>
                      {estado.pausa && (
                        <div className="small text-warning-emphasis mt-1">
                          <i className="bi bi-pause-circle me-1" />
                          En pausa hasta las {new Date(estado.pausa.hasta).toLocaleTimeString('es-MX')} ({estado.pausa.motivo}).
                          Continúa solo; el documento no se marca como error.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="fw-semibold">
                        {estado.pendientesAhora === 0
                          ? 'No hay documentos pendientes.'
                          : `${estado.pendientesAhora} documento(s) pendientes o con error.`}
                      </div>
                      <div className="small text-muted">
                        No se incluyen los documentos con fechas verificadas por un evaluador.
                      </div>
                    </>
                  )}
                </div>
                {estado.enCurso ? (
                  <Button variant="outline-danger" onClick={() => void detener()} disabled={enviando}>
                    Detener
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => void iniciar()}
                    disabled={enviando || estado.pendientesAhora === 0}
                  >
                    Analizar pendientes de todos los postulantes
                  </Button>
                )}
              </Card.Body>
              {(estado.enCurso || huboAnalisis) && estado.total > 0 && (
                <Card.Footer className="bg-white">
                  <ProgressBar now={pct} label={`${pct}%`} animated={estado.enCurso} />
                </Card.Footer>
              )}
            </Card>

            {huboAnalisis && (
              <>
                <h6 className="text-muted text-uppercase small fw-semibold mb-3">
                  {estado.enCurso ? 'Análisis en curso' : 'Último análisis'}
                </h6>
                <Row className="g-3 mb-3">
                  <Contador valor={estado.procesados} etiqueta={`Procesados de ${estado.total}`} />
                  <Contador valor={estado.correctos} etiqueta="Con fechas" className="text-success" />
                  <Contador valor={estado.sinFechas} etiqueta="Sin fechas encontradas" className="text-secondary" />
                  <Contador valor={estado.errores} etiqueta="Con error" className="text-danger" />
                </Row>
                {!estado.enCurso && estado.motivoFin && (
                  <Alert
                    variant={estado.motivoFin.startsWith('Detenido:') ? 'danger' : 'info'}
                    className="small py-2"
                  >
                    {estado.motivoFin}
                    {estado.finalizadoEn && ` (${new Date(estado.finalizadoEn).toLocaleString('es-MX')})`}
                  </Alert>
                )}

                {estado.recientes.length > 0 && (
                  <Card className="shadow-sm">
                    <Card.Header className="bg-white small fw-semibold">Últimos documentos procesados</Card.Header>
                    <Table size="sm" responsive className="small mb-0">
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Archivo</th>
                          <th>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estado.recientes.map((r) => (
                          <tr key={r.docId}>
                            <td>{r.label}</td>
                            <td className="text-muted text-truncate" style={{ maxWidth: 260 }} title={r.nombreOriginal}>
                              {r.nombreOriginal}
                            </td>
                            <td>
                              <DescripcionResultado r={r} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
