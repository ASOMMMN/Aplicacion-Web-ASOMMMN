'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Card,
  Col,
  Container,
  Form,
  OverlayTrigger,
  Placeholder,
  Popover,
  ProgressBar,
  Row,
  Table,
} from 'react-bootstrap';
import api from '@/lib/api/client';
import { IconAncla, SpinnerTimon } from '@/components/ui/NauticalIcons';
import { PortholeAvatar } from '@/components/ui/PortholeAvatar';
import {
  estadoGeneral,
  ESTADO_GENERAL_CONFIG,
  type EstadoGeneral,
} from '@/lib/estadoCandidato';

type EstadoExpediente = 'en_proceso' | 'enviado';
type EstadoEvaluacion = 'pendiente' | 'en_evaluacion' | 'evaluado';
type CampoOrden = 'actualizadoEn' | 'creadoEn' | 'nombreCompleto' | 'porcentajeExpediente';
type Direccion = 'asc' | 'desc';

interface CandidatoItem {
  postulanteId: string;
  nombreCompleto: string;
  nombre: string;
  apellidos: string;
  email: string;
  ciudad?: string;
  pais?: string;
  vacante?: string;
  creadoEn: string;
  actualizadoEn?: string;
  estadoExpediente: EstadoExpediente;
  porcentajeExpediente: number;
  requisitosFaltantes: string[];
  docsEvaluados: number;
  docsTotal: number;
  estadoEvaluacion: EstadoEvaluacion;
}

interface CandidatosPaginados {
  data: CandidatoItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface ResumenCandidatos {
  incompleto: number;
  en_proceso: number;
  completo: number;
  enviado: number;
  evaluado: number;
  total: number;
}

const LIMIT = 20;

function parseQueryFromLocation(): {
  page: number;
  estado: EstadoGeneral | '';
  vacante: string;
  q: string;
  ordenarPor: CampoOrden | '';
  direccion: Direccion;
} {
  if (typeof window === 'undefined') {
    return { page: 1, estado: '', vacante: '', q: '', ordenarPor: '', direccion: 'desc' };
  }
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get('page') ?? '1');
  const [ordenarPor, direccion] = (sp.get('sort') ?? '').split(':');
  const camposValidos: CampoOrden[] = ['actualizadoEn', 'creadoEn', 'nombreCompleto', 'porcentajeExpediente'];
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    estado: (sp.get('estado') as EstadoGeneral | null) ?? '',
    vacante: sp.get('vacante') ?? '',
    q: sp.get('q') ?? '',
    ordenarPor: camposValidos.includes(ordenarPor as CampoOrden) ? (ordenarPor as CampoOrden) : '',
    direccion: direccion === 'asc' ? 'asc' : 'desc',
  };
}

function formatFecha(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

function EstadoBadge({ estado }: { estado: EstadoGeneral }) {
  const cfg = ESTADO_GENERAL_CONFIG[estado];
  return (
    <span className={`badge badge-pill-asommmn ${cfg.badgeClass}`}>
      <i className={`bi ${cfg.icon}`} />
      {cfg.label}
    </span>
  );
}

function VacanteCell({ vacante }: { vacante?: string }) {
  return vacante ? (
    <span className="pennant-vacante">{vacante}</span>
  ) : (
    <span
      className="small text-danger d-inline-flex align-items-center gap-1"
      title="Sin vacante seleccionada: no podrá completar ni enviar su expediente."
    >
      <i className="bi bi-exclamation-triangle-fill" />
      Sin vacante
    </span>
  );
}

function AvanceBar({ porcentaje, faltantes }: { porcentaje: number; faltantes: string[] }) {
  const resumen = faltantes.slice(0, 2).join(', ');
  const contenido = (
    <div className="d-flex align-items-center gap-2">
      <ProgressBar
        now={porcentaje}
        style={{ height: 6, flex: 1 }}
        variant={porcentaje === 100 ? 'success' : 'warning'}
      />
      <span className="small fw-semibold" style={{ minWidth: 34 }}>
        {porcentaje}%
      </span>
    </div>
  );

  if (faltantes.length === 0) return contenido;

  const texto = `Falta: ${resumen}${faltantes.length > 2 ? ` +${faltantes.length - 2}` : ''}`;

  if (faltantes.length <= 2) {
    return (
      <>
        {contenido}
        <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: 2 }}>{texto}</div>
      </>
    );
  }

  const popover = (
    <Popover>
      <Popover.Header as="h3">Documentos faltantes ({faltantes.length})</Popover.Header>
      <Popover.Body>
        <ul className="mb-0 ps-3">
          {faltantes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </Popover.Body>
    </Popover>
  );

  return (
    <>
      {contenido}
      <OverlayTrigger trigger={['hover', 'focus', 'click']} placement="top" overlay={popover}>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-muted text-decoration-underline"
          style={{ fontSize: '0.68rem', marginTop: 2 }}
        >
          {texto}
        </button>
      </OverlayTrigger>
    </>
  );
}

function DocsEvaluadosInfo({ item, estado }: { item: CandidatoItem; estado: EstadoGeneral }) {
  return (
    <>
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
    </>
  );
}

function SortIcon({ activo, direccion }: { activo: boolean; direccion: Direccion }) {
  if (!activo) {
    return <i className="bi bi-arrow-down-up text-muted ms-1" style={{ fontSize: '0.7rem' }} aria-hidden="true" />;
  }
  return (
    <i
      className={`bi bi-arrow-${direccion === 'asc' ? 'up' : 'down'} ms-1`}
      style={{ fontSize: '0.7rem' }}
      aria-hidden="true"
    />
  );
}

function ThOrdenable({
  campo,
  label,
  ordenarPor,
  direccion,
  onOrdenar,
  style,
}: {
  campo: CampoOrden;
  label: string;
  ordenarPor: CampoOrden | '';
  direccion: Direccion;
  onOrdenar: (campo: CampoOrden) => void;
  style?: React.CSSProperties;
}) {
  const activo = ordenarPor === campo;
  return (
    <th
      style={{ ...style, cursor: 'pointer', whiteSpace: 'nowrap' }}
      aria-sort={activo ? (direccion === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="btn btn-link p-0 text-reset text-decoration-none fw-semibold d-inline-flex align-items-center"
        onClick={() => onOrdenar(campo)}
      >
        {label}
        <SortIcon activo={activo} direccion={direccion} />
      </button>
    </th>
  );
}

function SkeletonFilas({ columnas, filas = 6 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }).map((_, i) => (
        <tr key={i}>
          <td colSpan={columnas} className="py-3">
            <Placeholder as="div" animation="glow">
              <Placeholder xs={12} style={{ height: 28, borderRadius: 6 }} />
            </Placeholder>
          </td>
        </tr>
      ))}
    </>
  );
}

function SkeletonCards({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <>
      {Array.from({ length: cantidad }).map((_, i) => (
        <Card key={i} className="card-asommmn mb-3">
          <Card.Body>
            <Placeholder as="div" animation="glow">
              <Placeholder xs={8} style={{ height: 20 }} /> <br />
              <Placeholder xs={5} style={{ height: 14 }} className="mt-2" /> <br />
              <Placeholder xs={10} style={{ height: 24 }} className="mt-2" />
            </Placeholder>
          </Card.Body>
        </Card>
      ))}
    </>
  );
}

export default function CandidatosPage() {
  const router = useRouter();
  const initial = useMemo(() => parseQueryFromLocation(), []);

  const [page, setPage] = useState(initial.page);
  const [filtroEstado, setFiltroEstado] = useState<EstadoGeneral | ''>(initial.estado);
  const [vacanteFiltro, setVacanteFiltro] = useState(initial.vacante);
  const [search, setSearch] = useState(initial.q);
  const [searchDebounced, setSearchDebounced] = useState(initial.q);
  const [ordenarPor, setOrdenarPor] = useState<CampoOrden | ''>(initial.ordenarPor);
  const [direccion, setDireccion] = useState<Direccion>(initial.direccion);

  const [paginado, setPaginado] = useState<CandidatosPaginados | null>(null);
  const [resumen, setResumen] = useState<ResumenCandidatos | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Refleja los filtros/orden/página en la URL (reemplaza, no apila historial).
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (filtroEstado) params.set('estado', filtroEstado);
    if (vacanteFiltro) params.set('vacante', vacanteFiltro);
    if (searchDebounced) params.set('q', searchDebounced);
    if (ordenarPor) params.set('sort', `${ordenarPor}:${direccion}`);
    const qs = params.toString();
    router.replace(qs ? `/candidatos?${qs}` : '/candidatos', { scroll: false });
  }, [page, filtroEstado, vacanteFiltro, searchDebounced, ordenarPor, direccion, router]);

  // Vuelve a la página 1 cuando cambian filtros/orden (pero no en el montaje inicial).
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    setPage(1);
  }, [filtroEstado, vacanteFiltro, searchDebounced, ordenarPor, direccion]);

  const cargar = useCallback(async () => {
    try {
      setRefreshing(true);
      setError('');
      const paramsLista: Record<string, string | number> = { page, limit: LIMIT };
      if (filtroEstado) paramsLista.estado = filtroEstado;
      if (vacanteFiltro) paramsLista.vacante = vacanteFiltro;
      if (searchDebounced) paramsLista.q = searchDebounced;
      if (ordenarPor) {
        paramsLista.ordenarPor = ordenarPor;
        paramsLista.direccion = direccion;
      }
      const paramsResumen: Record<string, string> = {};
      if (vacanteFiltro) paramsResumen.vacante = vacanteFiltro;
      if (searchDebounced) paramsResumen.q = searchDebounced;

      const [listaRes, resumenRes] = await Promise.all([
        api.get<CandidatosPaginados>('/evaluaciones/candidatos', { params: paramsLista }),
        api.get<ResumenCandidatos>('/evaluaciones/candidatos/resumen', { params: paramsResumen }),
      ]);
      setPaginado(listaRes.data);
      setResumen(resumenRes.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      console.error('[candidatos] fallo al cargar', err);
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, filtroEstado, vacanteFiltro, searchDebounced, ordenarPor, direccion]);

  useEffect(() => {
    const ejecutar = async () => {
      await cargar();
    };
    void ejecutar();
  }, [cargar]);

  const items = paginado?.data ?? [];

  const toggleOrden = (campo: CampoOrden) => {
    if (ordenarPor !== campo) {
      setOrdenarPor(campo);
      setDireccion('asc');
    } else {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  const aplicarFiltroEstado = (valor: EstadoGeneral) => {
    setFiltroEstado((prev) => (prev === valor ? '' : valor));
  };

  const exportarCSV = async () => {
    setExportando(true);
    setError('');
    try {
      // El CSV se genera en el servidor (mismos filtros, sin paginar) y
      // queda auditado ahí: quién exportó, con qué filtros y cuántas filas.
      const params: Record<string, string> = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (vacanteFiltro) params.vacante = vacanteFiltro;
      if (searchDebounced) params.q = searchDebounced;

      const res = await api.get<Blob>('/evaluaciones/candidatos/exportar', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `candidatos_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setExportando(false);
    }
  };

  const columnas = 9;

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
                <Form.Label htmlFor="candidatos-buscar" className="visually-hidden">
                  Buscar candidatos
                </Form.Label>
                <Form.Control
                  id="candidatos-buscar"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, correo, vacante…"
                />
              </Col>
              <Col xs="auto">
                <Form.Label htmlFor="candidatos-filtro-vacante" className="visually-hidden">
                  Filtrar por vacante
                </Form.Label>
                <Form.Control
                  id="candidatos-filtro-vacante"
                  value={vacanteFiltro}
                  onChange={(e) => setVacanteFiltro(e.target.value)}
                  placeholder="Vacante…"
                  style={{ minWidth: 140 }}
                />
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
              <Col xs="auto">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => void exportarCSV()}
                  disabled={exportando}
                >
                  {exportando ? <SpinnerTimon size={16} /> : <i className="bi bi-download me-1" />}
                  Exportar CSV
                </button>
              </Col>
            </Row>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="shadow-sm d-flex justify-content-between align-items-center">
            <span>{error}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void cargar()}>
              Reintentar
            </button>
          </Alert>
        )}

        <div className="horizonte-divider" />

        {/* KPIs */}
        <Row className="g-3 mb-4">
          <Col md={4} lg={2}>
            <Card className="card-asommmn card-asommmn-top-azul card-riveted h-100">
              <Card.Body>
                <div className="text-muted small">Visibles</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-azul)' }}>
                  {resumen ? resumen.total : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} lg={2}>
            <Card
              className="card-asommmn card-asommmn-top-verde card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => aplicarFiltroEstado('completo')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="completo" />
                  <span className="text-muted small">Completos</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#1D9E75' }}>
                  {resumen ? resumen.completo : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} lg={2}>
            <Card
              className="card-asommmn card-asommmn-top-azul card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => aplicarFiltroEstado('enviado')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="enviado" />
                  <span className="text-muted small">Enviados</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-azul)' }}>
                  {resumen ? resumen.enviado : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} lg={2}>
            <Card
              className="card-asommmn card-asommmn-top-dorado card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => aplicarFiltroEstado('en_proceso')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="en_proceso" />
                  <span className="text-muted small">En proceso</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-dorado)' }}>
                  {resumen ? resumen.en_proceso : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} lg={2}>
            <Card
              className="card-asommmn card-asommmn-top-rojo card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => aplicarFiltroEstado('incompleto')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="incompleto" />
                  <span className="text-muted small">Incompletos</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#C0392B' }}>
                  {resumen ? resumen.incompleto : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} lg={2}>
            <Card
              className="card-asommmn card-asommmn-top-verde card-riveted h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => aplicarFiltroEstado('evaluado')}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado="evaluado" />
                  <span className="text-muted small">Evaluados</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: '#0F6E4F' }}>
                  {resumen ? resumen.evaluado : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <div className="horizonte-divider" />

        {/* Tabla (md+) */}
        <Card className="card-asommmn card-asommmn-top-azul d-none d-md-block">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 16 }}></th>
                    <ThOrdenable campo="nombreCompleto" label="Candidato" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                    <th>Vacante</th>
                    <ThOrdenable campo="creadoEn" label="Fecha de postulación" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                    <ThOrdenable campo="actualizadoEn" label="Última actividad" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                    <th>Estado postulación</th>
                    <ThOrdenable campo="porcentajeExpediente" label="Avance de carga de documentos" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} style={{ minWidth: 180 }} />
                    <th>Documentos evaluados</th>
                    <th className="text-end">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonFilas columnas={columnas} />
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={columnas} className="text-center text-muted py-4">
                        <div className="empty-state justify-content-center">
                          <IconAncla size={18} />
                          <span>No hay candidatos que coincidan con los filtros.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const estado = estadoGeneral(item);
                      return (
                        <tr key={item.postulanteId} style={{ opacity: refreshing ? 0.6 : 1 }}>
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
                          <td><VacanteCell vacante={item.vacante} /></td>
                          <td className="small">{formatFecha(item.creadoEn)}</td>
                          <td className="small">{formatFecha(item.actualizadoEn)}</td>
                          <td><EstadoBadge estado={estado} /></td>
                          <td style={{ minWidth: 160 }}>
                            <AvanceBar porcentaje={item.porcentajeExpediente} faltantes={item.requisitosFaltantes} />
                          </td>
                          <td>
                            <DocsEvaluadosInfo item={item} estado={estado} />
                          </td>
                          <td className="text-end">
                            <Link href={`/candidato/${item.postulanteId}`} className="btn btn-sm btn-outline-primary">
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

        {/* Tarjetas apiladas (móvil) */}
        <div className="d-md-none">
          {loading ? (
            <SkeletonCards />
          ) : items.length === 0 ? (
            <div className="empty-state justify-content-center py-4">
              <IconAncla size={18} />
              <span>No hay candidatos que coincidan con los filtros.</span>
            </div>
          ) : (
            items.map((item) => {
              const estado = estadoGeneral(item);
              return (
                <Card key={item.postulanteId} className="card-asommmn mb-3" style={{ opacity: refreshing ? 0.6 : 1 }}>
                  <Card.Body>
                    <div className="d-flex align-items-start gap-2 mb-2">
                      <PortholeAvatar nombre={item.nombre} apellidos={item.apellidos} size={40} />
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-semibold">{item.nombreCompleto}</div>
                        <div className="text-muted small">{item.email}</div>
                      </div>
                      <EstadoDot estado={estado} />
                    </div>
                    <div className="mb-2"><VacanteCell vacante={item.vacante} /></div>
                    <div className="mb-2"><EstadoBadge estado={estado} /></div>
                    <div className="mb-2">
                      <AvanceBar porcentaje={item.porcentajeExpediente} faltantes={item.requisitosFaltantes} />
                    </div>
                    <div className="mb-2">
                      <DocsEvaluadosInfo item={item} estado={estado} />
                    </div>
                    <Row className="small text-muted g-2 mb-3">
                      <Col xs={6}>Postuló: {formatFecha(item.creadoEn)}</Col>
                      <Col xs={6}>Actividad: {formatFecha(item.actualizadoEn)}</Col>
                    </Row>
                    <Link href={`/candidato/${item.postulanteId}`} className="btn btn-sm btn-outline-primary w-100">
                      Revisar
                    </Link>
                  </Card.Body>
                </Card>
              );
            })
          )}
        </div>

        {/* Paginación */}
        {paginado && paginado.pages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="small text-muted">
              Página {paginado.page} de {paginado.pages} · {paginado.total} candidatos
            </span>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={page <= 1 || refreshing}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Anterior
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={page >= paginado.pages || refreshing}
                onClick={() => setPage((p) => Math.min(paginado.pages, p + 1))}
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

      </Container>
    </div>
  );
}
