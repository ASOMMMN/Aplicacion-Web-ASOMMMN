'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Pagination,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import api from '@/lib/api/client';

interface AuditoriaItem {
  _id: string;
  actorEmail: string;
  accion: string;
  recurso: string;
  recursoId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  creadoEn: string;
}

interface AuditoriaResponse {
  data: AuditoriaItem[];
  total: number;
  page: number;
  pages: number;
}

const accionVariant = (accion: string): string => {
  if (accion.startsWith('auth.')) return 'primary';
  if (accion.includes('bloquear') || accion.includes('rechazado')) return 'danger';
  if (accion.includes('activar') || accion.includes('completado')) return 'success';
  return 'secondary';
};

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
};

const toErrorMessage = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object' && 'message' in value)
    return toErrorMessage((value as { message?: unknown }).message);
  return String(value ?? 'Error inesperado');
};

const LIMIT = 50;

export default function AuditoriaPage() {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [actorEmail, setActorEmail] = useState('');
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const load = useCallback(
    async (targetPage: number) => {
      try {
        setLoading(true);
        setError('');
        const params: Record<string, unknown> = { page: targetPage, limit: LIMIT };
        if (actorEmail.trim()) params.actorEmail = actorEmail.trim();
        if (accion.trim()) params.accion = accion.trim();
        if (desde) params.desde = desde;
        if (hasta) params.hasta = hasta;

        const res = await api.get<AuditoriaResponse>('/auditoria', { params });
        setItems(res.data?.data ?? []);
        setTotal(res.data?.total ?? 0);
        setPages(res.data?.pages ?? 1);
        setPage(targetPage);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
        setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
      } finally {
        setLoading(false);
      }
    },
    [actorEmail, accion, desde, hasta],
  );

  useEffect(() => {
    const init = async () => { await load(1); };
    init();
  }, [load]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    void load(1);
  };

  const handleClear = () => {
    setActorEmail('');
    setAccion('');
    setDesde('');
    setHasta('');
  };

  const paginationItems = [];
  for (let n = 1; n <= pages; n++) {
    paginationItems.push(
      <Pagination.Item key={n} active={n === page} onClick={() => void load(n)}>
        {n}
      </Pagination.Item>,
    );
  }

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container fluid>
        <Row className="mb-4 align-items-end g-3">
          <Col>
            <div className="d-flex flex-column gap-2">
              <Badge bg="dark" className="align-self-start">
                Administración
              </Badge>
              <h1 className="h3 fw-bold mb-0">Registro de auditoría</h1>
              <p className="text-muted mb-0">
                Acciones sensibles registradas en el sistema.{' '}
                {!loading && (
                  <span className="fw-semibold">{total} registro(s)</span>
                )}
              </p>
            </div>
          </Col>
          <Col xs="auto">
            <Button variant="outline-secondary" size="sm" onClick={() => void load(page)}>
              Refrescar
            </Button>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="shadow-sm">
            {error}
          </Alert>
        )}

        <Card className="shadow-sm border-0 mb-4">
          <Card.Body>
            <Form onSubmit={handleFilter}>
              <Row className="g-3 align-items-end">
                <Col md={3}>
                  <Form.Label className="small text-muted mb-1">Usuario (email)</Form.Label>
                  <Form.Control
                    size="sm"
                    placeholder="ej. admin@"
                    value={actorEmail}
                    onChange={(e) => setActorEmail(e.target.value)}
                  />
                </Col>
                <Col md={3}>
                  <Form.Label className="small text-muted mb-1">Acción</Form.Label>
                  <Form.Control
                    size="sm"
                    placeholder="ej. auth.login"
                    value={accion}
                    onChange={(e) => setAccion(e.target.value)}
                  />
                </Col>
                <Col md={2}>
                  <Form.Label className="small text-muted mb-1">Desde</Form.Label>
                  <Form.Control
                    size="sm"
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                  />
                </Col>
                <Col md={2}>
                  <Form.Label className="small text-muted mb-1">Hasta</Form.Label>
                  <Form.Control
                    size="sm"
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                  />
                </Col>
                <Col md="auto" className="d-flex gap-2">
                  <Button size="sm" type="submit" disabled={loading}>
                    Filtrar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    type="button"
                    onClick={handleClear}
                  >
                    Limpiar
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card.Body>
        </Card>

        <Card className="shadow-sm border-0">
          <Card.Body>
            {loading ? (
              <div className="d-flex justify-content-center py-5">
                <Spinner animation="border" />
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0 small">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Actor</th>
                        <th>Acción</th>
                        <th>Recurso</th>
                        <th>ID Recurso</th>
                        <th>IP</th>
                        <th>Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-4">
                            No hay registros con esos filtros.
                          </td>
                        </tr>
                      ) : (
                        items.map((item) => (
                          <tr key={item._id}>
                            <td className="text-nowrap text-muted">
                              {formatDate(item.creadoEn)}
                            </td>
                            <td>{item.actorEmail}</td>
                            <td>
                              <Badge bg={accionVariant(item.accion)} className="font-monospace">
                                {item.accion}
                              </Badge>
                            </td>
                            <td>{item.recurso}</td>
                            <td className="text-muted font-monospace" style={{ fontSize: '0.75em' }}>
                              {item.recursoId ?? '-'}
                            </td>
                            <td className="text-muted">{item.ipAddress ?? '-'}</td>
                            <td className="text-muted" style={{ maxWidth: 200 }}>
                              {item.metadata
                                ? (
                                  <span
                                    className="font-monospace"
                                    style={{ fontSize: '0.75em', wordBreak: 'break-all' }}
                                    title={JSON.stringify(item.metadata, null, 2)}
                                  >
                                    {JSON.stringify(item.metadata).slice(0, 80)}
                                    {JSON.stringify(item.metadata).length > 80 && '…'}
                                  </span>
                                )
                                : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>

                {pages > 1 && (
                  <div className="d-flex justify-content-between align-items-center mt-3">
                    <span className="text-muted small">
                      Página {page} de {pages} — {total} registros
                    </span>
                    <Pagination size="sm" className="mb-0">
                      <Pagination.Prev disabled={page === 1} onClick={() => void load(page - 1)} />
                      {paginationItems}
                      <Pagination.Next
                        disabled={page === pages}
                        onClick={() => void load(page + 1)}
                      />
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
