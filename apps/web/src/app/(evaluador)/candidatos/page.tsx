'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
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
import {
  estadoGeneral,
  grupoAvance,
  ESTADO_GENERAL_CONFIG,
  type EstadoGeneral,
  type GrupoAvance,
} from '@/lib/estadoCandidato';

type Estado = 'en_proceso' | 'completado' | 'rechazado';
type EstadoExpediente = 'en_proceso' | 'enviado';
type EstadoEvaluacion = 'pendiente' | 'en_evaluacion' | 'evaluado';

interface CandidatoItem {
  postulanteId: string;
  nombreCompleto: string;
  nombre: string;
  apellidos: string;
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
  docsEvaluados: number;
  docsTotal: number;
  estadoEvaluacion: EstadoEvaluacion;
}

/** Fondo tenue de fila según el grupo de avance, puramente decorativo. */
const grupoBg: Record<GrupoAvance, string> = {
  completo: 'rgba(29,158,117,.12)',
  en_proceso: 'rgba(201,162,75,.12)',
  incompleto: 'rgba(192,57,43,.10)',
};

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

/** Punto de color; decorativo únicamente — el badge de texto ya comunica el estado a lectores de pantalla. */
function EstadoDot({ estado }: { estado: EstadoGeneral }) {
  const cfg = ESTADO_GENERAL_CONFIG[estado];
  return (
    <span
      aria-hidden="true"
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
  const [filtroGrupo, setFiltroGrupo] = useState<GrupoAvance | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoGeneral | ''>('');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get<CandidatoItem[]>('/evaluaciones/candidatos');
        if (res.data?.[0] && res.data[0].docsEvaluados === undefined) {
          console.warn(
            '[candidatos] la API no devolvió docsEvaluados/docsTotal — el backend probablemente no tiene desplegado el último commit. Item recibido:',
            res.data[0],
          );
        }
        setItems(res.data ?? []);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
        console.error('[candidatos] fallo /evaluaciones/candidatos', err);
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
      const estado = estadoGeneral(item);
      const matchGrupo = !filtroGrupo || grupoAvance(estado) === filtroGrupo;
      const matchEstado = !filtroEstado || estado === filtroEstado;
      return matchQ && matchGrupo && matchEstado;
    });
  }, [items, search, filtroGrupo, filtroEstado]);

  const counts = useMemo(() => {
    const porGrupo: Record<GrupoAvance, number> = { completo: 0, en_proceso: 0, incompleto: 0 };
    let enviados = 0;
    for (const item of items) {
      const estado = estadoGeneral(item);
      porGrupo[grupoAvance(estado)] += 1;
      if (estado === 'enviado' || estado === 'evaluado') enviados += 1;
    }
    return { ...porGrupo, enviados };
  }, [items]);

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
            <span className="badge badge-pill-asommmn badge-estado-proceso mb-2">Evaluación</span>
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
                  aria-label="Filtrar por avance de carga de documentos"
                  value={filtroGrupo}
                  onChange={(e) => setFiltroGrupo(e.target.value as GrupoAvance | '')}
                  style={{ minWidth: 155 }}
                >
                  <option value="">Avance: todos</option>
                  <option value="completo">🟢 Completo</option>
                  <option value="en_proceso">🟡 En proceso</option>
                  <option value="incompleto">🔴 Incompleto</option>
                </Form.Select>
              </Col>
              <Col xs="auto">
                <Form.Select
                  aria-label="Filtrar por estado de la postulación"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as EstadoGeneral | '')}
                  style={{ minWidth: 155 }}
                >
                  <option value="">Estado: todos</option>
                  {Object.entries(ESTADO_GENERAL_CONFIG).map(([clave, cfg]) => (
                    <option key={clave} value={clave}>{cfg.label}</option>
                  ))}
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
            <Card className="card-asommmn card-asommmn-top-azul card-riveted h-100">
              <Card.Body>
                <div className="text-muted small">Candidatos visibles</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-azul)' }}>{filtered.length}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-asommmn card-asommmn-top-verde card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroGrupo(filtroGrupo === 'completo' ? '' : 'completo')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="completo" />
                  <span className="text-muted small">Completos / Enviados</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#1D9E75' }}>
                  {counts.completo} <span className="fs-6 fw-normal text-muted">({counts.enviados} enviados)</span>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-asommmn card-asommmn-top-dorado card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroGrupo(filtroGrupo === 'en_proceso' ? '' : 'en_proceso')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="en_proceso" />
                  <span className="text-muted small">En proceso</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-dorado)' }}>{counts.en_proceso}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card
              className="card-asommmn card-asommmn-top-rojo card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setFiltroGrupo(filtroGrupo === 'incompleto' ? '' : 'incompleto')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="incompleto" />
                  <span className="text-muted small">Incompletos (sin CV/vacante)</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#C0392B' }}>{counts.incompleto}</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <div className="horizonte-divider" />

        {/* Tabla */}
        <Card className="card-asommmn card-asommmn-top-azul">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 16 }}></th>
                    <th>Candidato</th>
                    <th>Vacante</th>
                    <th>Estado postulación</th>
                    <th style={{ minWidth: 160 }}>Avance de carga de documentos</th>
                    <th>Documentos evaluados</th>
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
                      const estado = estadoGeneral(item);
                      return (
                        <tr key={item.postulanteId} style={{ background: grupoBg[grupoAvance(estado)] }}>
                          <td className="ps-3">
                            <EstadoDot estado={estado} />
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <PortholeAvatar nombre={item.nombre} apellidos={item.apellidos} size={38} />
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
                              <span className="small text-danger d-inline-flex align-items-center gap-1" title="Sin vacante seleccionada: no podrá completar ni enviar su expediente.">
                                <i className="bi bi-exclamation-triangle-fill" />
                                Sin vacante
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-pill-asommmn ${ESTADO_GENERAL_CONFIG[estado].badgeClass}`}>
                              <i className={`bi ${ESTADO_GENERAL_CONFIG[estado].icon}`} />
                              {ESTADO_GENERAL_CONFIG[estado].label}
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
                            <div className="small fw-semibold">
                              {item.estadoEvaluacion === 'evaluado' && (
                                <i className="bi bi-check-circle-fill text-success me-1" />
                              )}
                              {item.estadoEvaluacion === 'en_evaluacion' && (
                                <i className="bi bi-hourglass-split text-warning me-1" />
                              )}
                              {item.docsEvaluados ?? 0}/{item.docsTotal ?? 0} evaluados
                            </div>
                            {item.estadoEvaluacion === 'pendiente' && estado === 'enviado' && (
                              <span className="small text-muted">Pendiente de evaluación</span>
                            )}
                          </td>
                          <td className="text-end">
                            <Link
                              href={`/candidato/${item.postulanteId}`}
                              className="btn btn-sm btn-outline-primary"
                            >
                              Revisar
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
