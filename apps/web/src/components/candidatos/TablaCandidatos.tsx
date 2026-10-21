'use client';

import Link from 'next/link';
import { Card, Form, OverlayTrigger, Placeholder, Popover, ProgressBar, Table } from 'react-bootstrap';
import { IconAncla } from '@/components/ui/NauticalIcons';
import { PortholeAvatar } from '@/components/ui/PortholeAvatar';
import { ESTADO_GENERAL_CONFIG, type EstadoGeneral } from '@/lib/estadoCandidato';
import type {
  CampoOrden,
  CandidatoItem,
  CandidatosPaginados,
  Direccion,
  Vista,
} from '@/hooks/useCandidatosQuery';

function formatFecha(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Email del candidato, o un ID corto cuando no hay (usuario eliminado). */
function emailOId(item: { email: string; postulanteId: string }): string {
  return item.email || `ID: ${item.postulanteId.slice(-8)}`;
}

function origenEliminacionTexto(item: CandidatoItem): string {
  if (item.eliminadoPorNombre || item.eliminadoPorEmail) {
    return `Eliminado por ${item.eliminadoPorNombre || item.eliminadoPorEmail}`;
  }
  if (item.eliminadoOrigen === 'admin') return 'Eliminado por un administrador';
  if (item.eliminadoOrigen === 'self') return 'El usuario eliminó su cuenta';
  return 'Origen desconocido (anterior al registro de auditoría)';
}

/** Badge + línea secundaria para candidatos de cuenta eliminada (admin/self/desconocido). */
function EliminadoInfo({ item }: { item: CandidatoItem }) {
  const fecha = item.eliminadoEn ? formatFecha(item.eliminadoEn) : null;
  const texto = origenEliminacionTexto(item);
  const tooltip = (
    <Popover>
      <Popover.Body className="small">
        {texto}
        {fecha && <div className="text-muted">Eliminado el {fecha}</div>}
        {item.eliminadoMotivo && <div className="text-muted">Motivo: {item.eliminadoMotivo}</div>}
      </Popover.Body>
    </Popover>
  );
  return (
    <div className="d-flex align-items-center gap-1 flex-wrap">
      <span className="badge badge-pill-asommmn bg-secondary-subtle text-dark border">
        <i className="bi bi-person-x-fill me-1" />
        Eliminado
      </span>
      <OverlayTrigger trigger={['hover', 'focus', 'click']} placement="top" overlay={tooltip}>
        <span className="text-muted small text-truncate" style={{ cursor: 'help', maxWidth: 220 }}>
          {texto}
          {fecha ? ` · ${fecha}` : ''}
        </span>
      </OverlayTrigger>
    </div>
  );
}

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
        style={{ height: 6, flex: '1 1 auto', maxWidth: 90, minWidth: 40 }}
        variant={porcentaje === 100 ? 'success' : 'warning'}
      />
      <span className="small fw-semibold text-nowrap" style={{ minWidth: 30 }}>
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
  const estadoTexto =
    item.estadoEvaluacion === 'pendiente' && estado === 'enviado'
      ? 'Pendiente'
      : item.estadoEvaluacion === 'evaluado'
        ? 'Evaluado'
        : item.estadoEvaluacion === 'en_evaluacion'
          ? 'En evaluación'
          : 'Evaluados';
  return (
    <>
      <div className="small fw-semibold text-nowrap">
        {item.estadoEvaluacion === 'evaluado' && (
          <i className="bi bi-check-circle-fill text-success me-1" />
        )}
        {item.estadoEvaluacion === 'en_evaluacion' && (
          <i className="bi bi-hourglass-split text-warning me-1" />
        )}
        {item.docsEvaluados ?? 0}/{item.docsTotal ?? 0}
      </div>
      <div className="small text-muted text-truncate">{estadoTexto}</div>
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
  className,
}: {
  campo: CampoOrden;
  label: string;
  ordenarPor: CampoOrden | '';
  direccion: Direccion;
  onOrdenar: (campo: CampoOrden) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  // "Última actividad" se muestra activa/desc cuando no hay ordenarPor explícito:
  // es puramente visual, el backend sigue usando su orden por defecto (FIFO/admin).
  const activo = ordenarPor === campo || (ordenarPor === '' && campo === 'actualizadoEn');
  const direccionMostrada = ordenarPor === '' && campo === 'actualizadoEn' ? 'desc' : direccion;
  return (
    <th
      className={className}
      style={{ ...style, cursor: 'pointer' }}
      aria-sort={activo ? (direccionMostrada === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="btn btn-link p-0 text-reset text-decoration-none d-inline-flex align-items-center"
        onClick={() => onOrdenar(campo)}
      >
        {label}
        <SortIcon activo={activo} direccion={direccionMostrada} />
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

const COLUMNAS = 9;

/** Combinaciones de orden preseleccionadas para el select compacto de móvil (sin cabeceras ahí). */
const OPCIONES_ORDEN_MOVIL: { campo: CampoOrden; direccion: Direccion; label: string }[] = [
  { campo: 'actualizadoEn', direccion: 'desc', label: 'Más recientes' },
  { campo: 'creadoEn', direccion: 'desc', label: 'Postulación más reciente' },
  { campo: 'nombreCompleto', direccion: 'asc', label: 'Candidato (A-Z)' },
  { campo: 'porcentajeExpediente', direccion: 'desc', label: 'Avance de carga' },
  { campo: 'docsEvaluados', direccion: 'desc', label: 'Docs. evaluados' },
];

export function TablaCandidatos({
  items,
  paginado,
  loading,
  refreshing,
  ordenarPor,
  direccion,
  toggleOrden,
  vista,
  page,
  setPage,
  onLimpiarFiltros,
}: {
  items: CandidatoItem[];
  paginado: CandidatosPaginados | null;
  loading: boolean;
  refreshing: boolean;
  ordenarPor: CampoOrden | '';
  direccion: Direccion;
  toggleOrden: (campo: CampoOrden) => void;
  vista: Vista;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  onLimpiarFiltros: () => void;
}) {
  const opcionesOrdenMovil =
    vista === 'papelera'
      ? [...OPCIONES_ORDEN_MOVIL, { campo: 'eliminadoEn' as CampoOrden, direccion: 'desc' as Direccion, label: 'Fecha de eliminación' }]
      : OPCIONES_ORDEN_MOVIL;
  const valorOrdenMovil = ordenarPor ? `${ordenarPor}:${direccion}` : '';

  const EmptyState = (
    <div className="empty-state justify-content-center py-4 flex-column gap-2">
      <div className="d-flex align-items-center gap-2 justify-content-center">
        <IconAncla size={18} />
        <span>Sin resultados.</span>
      </div>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onLimpiarFiltros}>
        Limpiar filtros
      </button>
    </div>
  );

  return (
    <>
      {/* Select compacto de orden (solo móvil, donde no hay cabeceras clicables) */}
      <div className="d-md-none mb-3">
        <Form.Label htmlFor="candidatos-orden-movil" className="visually-hidden">
          Ordenar candidatos
        </Form.Label>
        <Form.Select
          id="candidatos-orden-movil"
          value={valorOrdenMovil}
          onChange={(e) => {
            const [campo] = e.target.value.split(':');
            if (campo) toggleOrden(campo as CampoOrden);
          }}
        >
          <option value="">Orden por defecto</option>
          {opcionesOrdenMovil.map((o) => (
            <option key={`${o.campo}:${o.direccion}`} value={`${o.campo}:${o.direccion}`}>
              {o.label}
            </option>
          ))}
        </Form.Select>
      </div>

      {/* Tabla (md+) */}
      <Card className="card-asommmn card-asommmn-top-azul d-none d-md-block">
        <Card.Body>
          <div className="table-responsive">
            <Table hover className="align-middle mb-0 tabla-candidatos">
              <colgroup>
                <col style={{ width: '2%' }} />
                <col style={{ width: '23%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <ThOrdenable campo="nombreCompleto" label="Candidato" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                  <th>Vacante</th>
                  <ThOrdenable campo="creadoEn" label="Fecha de postulación" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                  <ThOrdenable
                    campo="actualizadoEn"
                    label="Última actividad"
                    ordenarPor={ordenarPor}
                    direccion={direccion}
                    onOrdenar={toggleOrden}
                    className="d-none d-xxl-table-cell"
                  />
                  <th>Estado postulación</th>
                  <ThOrdenable campo="porcentajeExpediente" label="Avance de carga" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                  <ThOrdenable campo="docsEvaluados" label="Docs. evaluados" ordenarPor={ordenarPor} direccion={direccion} onOrdenar={toggleOrden} />
                  <th className="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonFilas columnas={COLUMNAS} />
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNAS} className="text-center text-muted py-4">
                      {EmptyState}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const estado = item.estadoGeneral;
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
                              {item.eliminado ? (
                                <EliminadoInfo item={item} />
                              ) : (
                                <div className="text-muted small">{emailOId(item)}</div>
                              )}
                              {item.ciudad || item.pais ? (
                                <div className="text-muted small">
                                  {[item.ciudad, item.pais].filter(Boolean).join(', ')}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td><VacanteCell vacante={item.vacante} /></td>
                        <td className="small">
                          {formatFecha(item.creadoEn)}
                          <div className="text-muted d-xxl-none" style={{ fontSize: '0.68rem' }}>
                            Actividad: {formatFecha(item.actualizadoEn)}
                          </div>
                        </td>
                        <td className="small d-none d-xxl-table-cell">{formatFecha(item.actualizadoEn)}</td>
                        <td><EstadoBadge estado={estado} /></td>
                        <td>
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
          EmptyState
        ) : (
          items.map((item) => {
            const estado = item.estadoGeneral;
            return (
              <Card key={item.postulanteId} className="card-asommmn mb-3" style={{ opacity: refreshing ? 0.6 : 1 }}>
                <Card.Body>
                  <div className="d-flex align-items-start gap-2 mb-2">
                    <PortholeAvatar nombre={item.nombre} apellidos={item.apellidos} size={40} />
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="fw-semibold">{item.nombreCompleto}</div>
                      {item.eliminado ? (
                        <EliminadoInfo item={item} />
                      ) : (
                        <div className="text-muted small">{emailOId(item)}</div>
                      )}
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
                  <div className="row small text-muted g-2 mb-3">
                    <div className="col-6">Postuló: {formatFecha(item.creadoEn)}</div>
                    <div className="col-6">Actividad: {formatFecha(item.actualizadoEn)}</div>
                  </div>
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
    </>
  );
}
