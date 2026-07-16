'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import api from '@/lib/api/client';

interface EvaluadorStats {
  evaluadorId: string;
  nombre: string;
  total: number;
  promedio: number | null;
}

interface Estadisticas {
  usuarios: {
    total: number;
    postulantes: number;
    evaluadores: number;
    administradores: number;
    activos: number;
  };
  postulantes: {
    total: number;
    enProceso: number;
    completados: number;
    rechazados: number;
    conCV: number;
    sinCV: number;
  };
  evaluaciones: {
    total: number;
    promedioCalificacion: number | null;
    porEvaluador: EvaluadorStats[];
  };
  documentos: {
    total: number;
    ultimoMes: number;
  };
}

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

const StatCard = ({
  label,
  value,
  variant = 'dark',
  sub,
}: {
  label: string;
  value: string | number;
  variant?: string;
  sub?: string;
}) => (
  <Card className="shadow-sm border-0 h-100">
    <Card.Body>
      <div className="text-muted small mb-1">{label}</div>
      <div className={`fs-3 fw-bold text-${variant}`}>{value}</div>
      {sub && <div className="text-muted small mt-1">{sub}</div>}
    </Card.Body>
  </Card>
);

export default function AdminReportesPage() {
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const cargarEstadisticas = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<Estadisticas>('/reportes/estadisticas');
      setStats(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => { await cargarEstadisticas(); };
    init();
  }, []);

  const exportarCSV = async () => {
    try {
      setDownloading(true);
      const res = await api.get('/reportes/exportar-csv', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'candidatos.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center min-vh-100">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container className="py-4">
        <Alert variant="danger">No se pudieron cargar las estadísticas.</Alert>
      </Container>
    );
  }

  const pctConCV =
    stats.postulantes.total > 0
      ? Math.round((stats.postulantes.conCV / stats.postulantes.total) * 100)
      : 0;

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container fluid>
        {/* Cabecera */}
        <Row className="align-items-end g-3 mb-4">
          <Col lg={8}>
            <Badge bg="dark" className="mb-2">Administración</Badge>
            <h1 className="h3 fw-bold mb-1">Reportes y estadísticas</h1>
            <p className="text-muted mb-0">
              Resumen del estado del sistema y sus participantes.
            </p>
          </Col>
          <Col lg={4} className="d-flex gap-2 justify-content-lg-end">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => void cargarEstadisticas()}
              disabled={loading}
            >
              Actualizar
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={() => void exportarCSV()}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <Spinner size="sm" className="me-1" />
                  Exportando…
                </>
              ) : (
                '↓ Exportar CSV'
              )}
            </Button>
          </Col>
        </Row>

        {error && <Alert variant="danger" className="shadow-sm">{error}</Alert>}

        {/* Usuarios */}
        <h6 className="text-muted text-uppercase small fw-semibold mb-3 mt-2">Usuarios</h6>
        <Row className="g-3 mb-4">
          <Col md={3}>
            <StatCard label="Total usuarios" value={stats.usuarios.total} />
          </Col>
          <Col md={3}>
            <StatCard
              label="Postulantes"
              value={stats.usuarios.postulantes}
              variant="primary"
            />
          </Col>
          <Col md={3}>
            <StatCard
              label="Evaluadores"
              value={stats.usuarios.evaluadores}
              variant="info"
            />
          </Col>
          <Col md={3}>
            <StatCard
              label="Activos"
              value={stats.usuarios.activos}
              variant="success"
              sub={`de ${stats.usuarios.total} totales`}
            />
          </Col>
        </Row>

        {/* Postulantes */}
        <h6 className="text-muted text-uppercase small fw-semibold mb-3">Postulantes</h6>
        <Row className="g-3 mb-4">
          <Col md={2}>
            <StatCard label="Total" value={stats.postulantes.total} />
          </Col>
          <Col md={2}>
            <StatCard
              label="En proceso"
              value={stats.postulantes.enProceso}
              variant="warning"
            />
          </Col>
          <Col md={2}>
            <StatCard
              label="Completados"
              value={stats.postulantes.completados}
              variant="success"
            />
          </Col>
          <Col md={2}>
            <StatCard
              label="Rechazados"
              value={stats.postulantes.rechazados}
              variant="danger"
            />
          </Col>
          <Col md={2}>
            <StatCard
              label="Con CV"
              value={stats.postulantes.conCV}
              variant="success"
              sub={`${pctConCV}% del total`}
            />
          </Col>
          <Col md={2}>
            <StatCard
              label="Sin CV"
              value={stats.postulantes.sinCV}
              variant="secondary"
            />
          </Col>
        </Row>

        {/* Evaluaciones + Documentos */}
        <h6 className="text-muted text-uppercase small fw-semibold mb-3">Evaluaciones</h6>
        <Row className="g-3 mb-4">
          <Col md={3}>
            <StatCard label="Total evaluaciones" value={stats.evaluaciones.total} />
          </Col>
          <Col md={3}>
            <StatCard
              label="Calificación promedio"
              value={
                stats.evaluaciones.promedioCalificacion != null
                  ? `${stats.evaluaciones.promedioCalificacion} / 10`
                  : '—'
              }
              variant="primary"
            />
          </Col>
          <Col md={3}>
            <StatCard
              label="CVs subidos (total)"
              value={stats.documentos.total}
              variant="info"
            />
          </Col>
          <Col md={3}>
            <StatCard
              label="CVs último mes"
              value={stats.documentos.ultimoMes}
              variant="success"
            />
          </Col>
        </Row>

        {/* Tabla por evaluador */}
        {stats.evaluaciones.porEvaluador.length > 0 && (
          <>
            <h6 className="text-muted text-uppercase small fw-semibold mb-3">
              Actividad por evaluador
            </h6>
            <Card className="shadow-sm border-0">
              <Card.Body>
                <Table hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Evaluador</th>
                      <th className="text-center">Evaluaciones realizadas</th>
                      <th className="text-center">Calificación promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.evaluaciones.porEvaluador.map((ev) => (
                      <tr key={ev.evaluadorId}>
                        <td className="fw-semibold">{ev.nombre || '—'}</td>
                        <td className="text-center">
                          <Badge bg="info" className="fs-6">
                            {ev.total}
                          </Badge>
                        </td>
                        <td className="text-center">
                          {ev.promedio != null ? (
                            <span className="fw-semibold">{ev.promedio} / 10</span>
                          ) : (
                            <span className="text-muted">Sin calificaciones</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </>
        )}
      </Container>
    </div>
  );
}


