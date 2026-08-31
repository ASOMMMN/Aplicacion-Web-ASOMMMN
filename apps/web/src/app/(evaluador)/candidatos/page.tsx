'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Card,
  Col,
  Container,
  Form,
  ProgressBar,
  Row,
  Table,
} from 'react-bootstrap';
import api from '@/lib/api/client';
import { IconAncla, SpinnerTimon } from '@/components/ui/NauticalIcons';
import { PortholeAvatar } from '@/components/ui/PortholeAvatar';

type Estado = 'en_proceso' | 'completado' | 'rechazado';
type Semaforo = 'verde' | 'amarillo' | 'rojo';
type FiltroSemaforo = Semaforo | '';
type EstadoExpediente = 'en_proceso' | 'enviado';

type ResultadoEvaluacion = 'APROBADO' | 'RECHAZADO' | 'EN_REVISION';

interface CandidatoItem {
  postulanteId: string;
  nombreCompleto: string;
  email: string;
  estadoPostulacion: Estado;
  ciudad?: string;
  pais?: string;
  vacante?: string;
  tieneCV: boolean;
  versionCV?: number;
  estadoExpediente: EstadoExpediente;
  porcentajeExpediente: number;
  requisitosFaltantes: string[];
  semaforoClave: Semaforo;
  evaluado: boolean;
  evaluadorNombre?: string;
  fechaEvaluacion?: string;
  resultadoEvaluacion?: ResultadoEvaluacion;
}

const formatFechaEvaluacion = (fecha: string) =>
  new Date(fecha).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const semaforoConfig: Record<Semaforo, { color: string; label: string; bg: string }> = {
  verde:    { color: '#1D9E75', label: 'Completo',   bg: 'rgba(29,158,117,.12)' },
  amarillo: { color: '#C9A24B', label: 'En proceso', bg: 'rgba(201,162,75,.12)' },
  rojo:     { color: '#C0392B', label: 'Incompleto', bg: 'rgba(192,57,43,.10)'  },
};

const estadoPostulacionBadgeClass: Record<Semaforo, string> = {
  verde: 'badge-estado-aprobado',
  amarillo: 'badge-estado-proceso',
  rojo: 'badge-estado-rechazado',
};

const estadoPostulacionIconClass: Record<Semaforo, string> = {
  verde: 'bi-check-lg',
  amarillo: 'bi-clock',
  rojo: 'bi-x-lg',
};

function semaforoFromPorcentaje(porcentaje: number): Semaforo {
  if (porcentaje >= 100) return 'verde';
  if (porcentaje >= 34) return 'amarillo';
  return 'rojo';
}

function estadoPostulacionLabel(item: CandidatoItem, clave: Semaforo): string {
  if (item.estadoExpediente === 'enviado') return 'Enviado';
  return semaforoConfig[clave].label;
}

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

function SemaforoDot({ clave }: { clave: Semaforo }) {
  const cfg = semaforoConfig[clave];
  return (
    <span
      title={cfg.label}
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: cfg.color,
        boxShadow: `0 0 6px ${cfg.color}88`,
        flexShrink: 0,
      }}
    />
  );
}

export default function CandidatosPage() {
  const [items, setItems] = useState<CandidatoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtroSemaforo, setFiltroSemaforo] = useState<FiltroSemaforo>('');
  const [filtroExpediente, setFiltroExpediente] = useState<EstadoExpediente | ''>('');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get<CandidatoItem[]>('/evaluaciones/candidatos');
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
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchQ =
        !q ||
        item.nombreCompleto.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        (item.vacante ?? '').toLowerCase().includes(q) ||
        (item.ciudad ?? '').toLowerCase().includes(q);
      const matchSemaforo = !filtroSemaforo || semaforoFromPorcentaje(item.porcentajeExpediente) === filtroSemaforo;
      const matchExpediente = !filtroExpediente || item.estadoExpediente === filtroExpediente;
      return matchQ && matchSemaforo && matchExpediente;
    });
  }, [items, search, filtroSemaforo, filtroExpediente]);

  const counts = useMemo(
    () => ({
      verde: items.filter((i) => semaforoFromPorcentaje(i.porcentajeExpediente) === 'verde').length,
      amarillo: items.filter((i) => semaforoFromPorcentaje(i.porcentajeExpediente) === 'amarillo').length,
      rojo: items.filter((i) => semaforoFromPorcentaje(i.porcentajeExpediente) === 'rojo').length,
      enviados: items.filter((i) => i.estadoExpediente === 'enviado').length,
    }),
    [items]
  );

  if (loading) {
    return (
      <Container fluid className="nautical-panel d-flex justify-content-center align-items-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  return (
    <div className="py-4 nautical-panel" style={{ minHeight: '100vh' }}>
      <Container fluid>

        {/* Header */}
        <Row className="align-items-end g-3 mb-4">
          <Col lg={6}>
            <span className="badge badge-pill-enmv badge-estado-proceso mb-2">Evaluación</span>
            <h1 className="section-title">Panel de Evaluador</h1>
            <p className="text-muted mb-0">
              Revisa perfiles, CV y estado de postulación desde un solo lugar.
            </p>
          </Col>
          <Col lg={6}>
            <Row className="g-2">
              <Col>
                <Form.Control
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, correo, vacante…"
                />
              </Col>
              <Col xs="auto">
                <Form.Select
                  value={filtroSemaforo}
                  onChange={(e) => setFiltroSemaforo(e.target.value as FiltroSemaforo)}
                  style={{ minWidth: 155 }}
                >
                  <option value="">Todos</option>
                  <option value="verde">🟢 Completo</option>
                  <option value="amarillo">🟡 En proceso</option>
                  <option value="rojo">🔴 Incompleto</option>
                </Form.Select>
              </Col>
              <Col xs="auto">
                <Form.Select
                  value={filtroExpediente}
                  onChange={(e) => setFiltroExpediente(e.target.value as EstadoExpediente | '')}
                  style={{ minWidth: 145 }}
                >
                  <option value="">Expediente</option>
                  <option value="enviado">Enviado</option>
                  <option value="en_proceso">En proceso</option>
                </Form.Select>
              </Col>
            </Row>
          </Col>
        </Row>

        {error && <Alert variant="danger" className="shadow-sm">{error}</Alert>}

        <div className="horizonte-divider" />

        {/* KPIs semáforo */}
        <Row className="g-4 mb-4">
          <Col md={3}>
            <Card className="card-enmv card-enmv-top-azul card-riveted h-100">
              <Card.Body>
                <div className="text-muted small">Candidatos visibles</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-azul)' }}>{filtered.length}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-enmv card-enmv-top-verde card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroSemaforo(filtroSemaforo === 'verde' ? '' : 'verde')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <SemaforoDot clave="verde" />
                  <span className="text-muted small">Completos / Enviados</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#1D9E75' }}>
                  {counts.verde} <span className="fs-6 fw-normal text-muted">({counts.enviados} enviados)</span>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-enmv card-enmv-top-dorado card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroSemaforo(filtroSemaforo === 'amarillo' ? '' : 'amarillo')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <SemaforoDot clave="amarillo" />
                  <span className="text-muted small">En proceso</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-dorado)' }}>{counts.amarillo}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-enmv card-enmv-top-rojo card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroSemaforo(filtroSemaforo === 'rojo' ? '' : 'rojo')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <SemaforoDot clave="rojo" />
                  <span className="text-muted small">Incompletos (sin CV/vacante)</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#C0392B' }}>{counts.rojo}</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <div className="horizonte-divider" />

        {/* Tabla */}
        <Card className="card-enmv card-enmv-top-azul">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 16 }}></th>
                    <th>Candidato</th>
                    <th>Vacante</th>
                    <th>Estado postulación</th>
                    <th style={{ minWidth: 160 }}>Avance expediente</th>
                    <th>Expediente</th>
                    <th className="text-end">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        <div className="empty-state justify-content-center">
                          <IconAncla size={18} />
                          <span>No hay candidatos que coincidan con los filtros.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
                      const clave = semaforoFromPorcentaje(item.porcentajeExpediente);
                      const sem = semaforoConfig[clave];
                      return (
                        <tr key={item.postulanteId} style={{ background: sem.bg }}>
                          <td className="ps-3">
                            <SemaforoDot clave={clave} />
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <PortholeAvatar nombre={item.nombreCompleto} size={38} />
                              <div>
                                <div className="fw-semibold">{item.nombreCompleto}</div>
                                <div className="text-muted small">{item.email}</div>
                                {item.ciudad || item.pais ? (
                                  <div className="text-muted small">
                                    {[item.ciudad, item.pais].filter(Boolean).join(', ')}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            {item.vacante ? (
                              <span className="pennant-vacante">{item.vacante}</span>
                            ) : (
                              <span className="small text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-pill-enmv ${estadoPostulacionBadgeClass[clave]}`}>
                              <i className={`bi ${estadoPostulacionIconClass[clave]}`} />
                              {estadoPostulacionLabel(item, clave)}
                            </span>
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <div className="d-flex align-items-center gap-2">
                              <ProgressBar
                                now={item.porcentajeExpediente}
                                style={{ height: 6, flex: 1 }}
                                variant={item.porcentajeExpediente === 100 ? 'success' : 'warning'}
                              />
                              <span className="small fw-semibold" style={{ minWidth: 34 }}>
                                {item.porcentajeExpediente}%
                              </span>
                            </div>
                            {item.requisitosFaltantes.length > 0 && (
                              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: 2 }}>
                                Falta: {item.requisitosFaltantes.slice(0, 2).join(', ')}
                                {item.requisitosFaltantes.length > 2 && ` +${item.requisitosFaltantes.length - 2}`}
                              </div>
                            )}
                          </td>
                          <td>
                            {item.evaluado ? (
                              <div>
                                <div className="small fw-semibold text-success">
                                  <i className="bi bi-check-circle-fill me-1" />
                                  Evaluado
                                </div>
                                <div className="small">
                                  Por: <strong>{item.evaluadorNombre}</strong>
                                </div>
                                {item.fechaEvaluacion && (
                                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    {formatFechaEvaluacion(item.fechaEvaluacion)}
                                  </div>
                                )}
                              </div>
                            ) : item.estadoExpediente === 'enviado' ? (
                              <Badge bg="success" className="badge-pill-enmv">
                                <i className="bi bi-check-lg" />
                                Enviado
                              </Badge>
                            ) : (
                              <span className="small text-muted">Pendiente</span>
                            )}
                          </td>
                          <td className="text-end">
                            <Link
                              href={`/candidato/${item.postulanteId}`}
                              className={`btn btn-sm ${item.evaluado ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                            >
                              {item.evaluado ? 'Ver evaluación' : 'Revisar'}
                            </Link>
                          </td>
                        </tr>
                      );
                    })
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
