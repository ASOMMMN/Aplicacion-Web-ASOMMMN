'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import api from '@/lib/api/client';

type Estado = 'en_proceso' | 'completado' | 'rechazado';

interface EvaluacionGlobal {
  id: string;
  postulanteId: string;
  postulanteName: string;
  evaluadorId: string;
  evaluadorNombre: string;
  comentario: string;
  calificacion?: number;
  estadoSugerido: Estado;
  creadoEn: string;
}

const estadoColor: Record<Estado, string> = {
  en_proceso: 'warning',
  completado: 'success',
  rechazado: 'danger',
};

const estadoLabel: Record<Estado, string> = {
  en_proceso: 'En proceso',
  completado: 'Completado',
  rechazado: 'Rechazado',
};

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

const formatDate = (date: string) =>
  new Date(date).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function AdminEvaluacionesPage() {
  const [items, setItems] = useState<EvaluacionGlobal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchCandidato, setSearchCandidato] = useState('');
  const [searchEvaluador, setSearchEvaluador] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<'all' | Estado>('all');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get<EvaluacionGlobal[]>('/evaluaciones/todas');
        setItems(res.data ?? []);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
        setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filtered = useMemo(() => {
    const qC = searchCandidato.trim().toLowerCase();
    const qE = searchEvaluador.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCandidato = !qC || item.postulanteName.toLowerCase().includes(qC);
      const matchesEvaluador = !qE || item.evaluadorNombre.toLowerCase().includes(qE);
      const matchesEstado = estadoFilter === 'all' || item.estadoSugerido === estadoFilter;
      return matchesCandidato && matchesEvaluador && matchesEstado;
    });
  }, [items, searchCandidato, searchEvaluador, estadoFilter]);

  const stats = useMemo(() => {
    const evaluadoresUnicos = new Set(items.map((i) => i.evaluadorId)).size;
    const calificados = items.filter((i) => i.calificacion != null);
    const promedio =
      calificados.length > 0
        ? (calificados.reduce((s, i) => s + (i.calificacion ?? 0), 0) / calificados.length).toFixed(1)
        : null;
    return { total: items.length, evaluadoresUnicos, promedio };
  }, [items]);

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center min-vh-100">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container fluid>
        <Row className="align-items-end g-3 mb-4">
          <Col lg={8}>
            <Badge bg="dark" className="mb-2">Administración</Badge>
            <h1 className="h3 fw-bold mb-1">Historial de evaluaciones</h1>
            <p className="text-muted mb-0">
              Todas las evaluaciones registradas por los evaluadores.
            </p>
          </Col>
        </Row>

        {error && <Alert variant="danger" className="shadow-sm">{error}</Alert>}

        {/* Tarjetas resumen */}
        <Row className="g-3 mb-4">
          <Col md={4}>
            <Card className="shadow-sm border-0 h-100">
              <Card.Body>
                <div className="text-muted small">Total evaluaciones</div>
                <div className="fs-3 fw-bold">{stats.total}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="shadow-sm border-0 h-100">
              <Card.Body>
                <div className="text-muted small">Evaluadores activos</div>
                <div className="fs-3 fw-bold text-info">{stats.evaluadoresUnicos}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="shadow-sm border-0 h-100">
              <Card.Body>
                <div className="text-muted small">Calificación promedio</div>
                <div className="fs-3 fw-bold text-primary">
                  {stats.promedio != null ? `${stats.promedio} / 10` : '—'}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Filtros */}
        <Card className="shadow-sm border-0 mb-4">
          <Card.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Control
                  placeholder="Buscar candidato..."
                  value={searchCandidato}
                  onChange={(e) => setSearchCandidato(e.target.value)}
                />
              </Col>
              <Col md={4}>
                <Form.Control
                  placeholder="Buscar evaluador..."
                  value={searchEvaluador}
                  onChange={(e) => setSearchEvaluador(e.target.value)}
                />
              </Col>
              <Col md={4}>
                <Form.Select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value as 'all' | Estado)}
                >
                  <option value="all">Todos los estados</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="completado">Completado</option>
                  <option value="rechazado">Rechazado</option>
                </Form.Select>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Tabla */}
        <Card className="shadow-sm border-0">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="text-muted small">
                {filtered.length} resultado(s) de {items.length}
              </span>
            </div>
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Candidato</th>
                    <th>Evaluador</th>
                    <th>Estado sugerido</th>
                    <th>Calificación</th>
                    <th>Comentario</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No hay evaluaciones con esos filtros.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id}>
                        <td className="fw-semibold">{item.postulanteName || '—'}</td>
                        <td>{item.evaluadorNombre || '—'}</td>
                        <td>
                          <Badge bg={estadoColor[item.estadoSugerido]}>
                            {estadoLabel[item.estadoSugerido]}
                          </Badge>
                        </td>
                        <td className="text-center">
                          {item.calificacion != null ? (
                            <span className="fw-semibold">{item.calificacion}/10</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td
                          className="small text-muted"
                          style={{ maxWidth: 300 }}
                          title={item.comentario}
                        >
                          {item.comentario.length > 80
                            ? `${item.comentario.slice(0, 80)}…`
                            : item.comentario}
                        </td>
                        <td className="small text-muted">{formatDate(item.creadoEn)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
