import type { NotificacionAppItem, NotificacionItem } from '@/lib/api/notificaciones';
import { formatearFechaCalendarioMesCorto } from '@/lib/fechas';
import {
  MENSAJES_CAMPANA,
  fechaCompleta,
  fechaRelativa,
  textoContador,
} from '@/lib/notificacionesCampana';

/**
 * Vistas sin estado de la campanita (las usa NotificacionesBell). No usan el
 * contexto del Dropdown, así que se pueden renderizar en pruebas con
 * react-dom/server.
 */

export function ContadorCampana({ noLeidas }: { noLeidas: number }) {
  const texto = textoContador(noLeidas);
  if (!texto) return null;
  return (
    <span
      className="badge rounded-pill bg-danger badge-campana-asommmn"
      data-testid="contador-campana"
    >
      {texto}
      <span className="visually-hidden"> sin leer</span>
    </span>
  );
}

function mensajeDiasRestantes(dias: number) {
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Vence en 1 día';
  return `Vence en ${dias} días`;
}

const ICONO_AVISO: Record<NotificacionAppItem['tipo'], string> = {
  nuevo_candidato: 'bi-person-plus',
  expediente_completo: 'bi-folder-check',
};

export type PanelNotificacionesVistaProps = {
  avisos: NotificacionAppItem[];
  vencimientos: NotificacionItem[];
  /** Total sin leer (avisos + vencimientos). */
  noLeidas: number;
  cargando: boolean;
  error: string | null;
  marcandoTodas?: boolean;
  ahora?: Date;
  onAbrirAviso: (aviso: NotificacionAppItem) => void;
  onAbrirVencimiento: (vencimiento: NotificacionItem) => void;
  onMarcarTodas: () => void;
  onReintentar: () => void;
};

export function PanelNotificacionesVista({
  avisos,
  vencimientos,
  noLeidas,
  cargando,
  error,
  marcandoTodas = false,
  ahora,
  onAbrirAviso,
  onAbrirVencimiento,
  onMarcarTodas,
  onReintentar,
}: PanelNotificacionesVistaProps) {
  const vacio = avisos.length === 0 && vencimientos.length === 0;

  return (
    <div data-testid="panel-notificaciones">
      <div className="panel-notificaciones-encabezado d-flex justify-content-between align-items-center gap-2 px-3 py-2 border-bottom">
        <span className="fw-semibold small">
          <i className="bi bi-compass me-1" aria-hidden="true" />
          {MENSAJES_CAMPANA.titulo}
        </span>
        {noLeidas > 0 && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-nowrap"
            data-testid="btn-marcar-todas"
            disabled={marcandoTodas}
            aria-busy={marcandoTodas || undefined}
            onClick={onMarcarTodas}
          >
            {MENSAJES_CAMPANA.marcarTodas}
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger small m-2 py-2 px-3" role="alert">
          <div>{error}</div>
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={onReintentar}
          >
            {MENSAJES_CAMPANA.reintentar}
          </button>
        </div>
      )}

      {cargando && (
        <div className="text-center text-muted py-3 small" role="status">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          {MENSAJES_CAMPANA.cargando}
        </div>
      )}

      {!cargando && !error && vacio && (
        <div className="text-center text-muted py-3 small">{MENSAJES_CAMPANA.vacio}</div>
      )}

      {avisos.length > 0 && (
        <section aria-label={MENSAJES_CAMPANA.seccionCandidatos}>
          {vencimientos.length > 0 && (
            <div className="panel-notificaciones-seccion">{MENSAJES_CAMPANA.seccionCandidatos}</div>
          )}
          {avisos.map((aviso) => (
            <button
              key={aviso._id}
              type="button"
              data-testid="aviso-campana"
              data-leida={aviso.leida ? 'true' : 'false'}
              className={`dropdown-item d-flex gap-2 align-items-start${
                aviso.leida ? '' : ' notificacion-no-leida'
              }`}
              onClick={() => onAbrirAviso(aviso)}
            >
              <i
                className={`bi ${ICONO_AVISO[aviso.tipo] ?? 'bi-bell'} aviso-campana-icono`}
                aria-hidden="true"
              />
              <span className="flex-grow-1 min-w-0">
                <span className="d-block small">
                  {!aviso.leida && <span className="visually-hidden">Sin leer: </span>}
                  {aviso.mensaje}
                </span>
                <time
                  className="d-block text-muted"
                  style={{ fontSize: '0.75rem' }}
                  dateTime={aviso.fecha}
                  title={fechaCompleta(aviso.fecha)}
                >
                  {fechaRelativa(aviso.fecha, ahora)}
                </time>
              </span>
              {!aviso.leida && <span className="aviso-campana-punto" aria-hidden="true" />}
            </button>
          ))}
        </section>
      )}

      {vencimientos.length > 0 && (
        <section aria-label={MENSAJES_CAMPANA.seccionVencimientos}>
          {avisos.length > 0 && (
            <div className="panel-notificaciones-seccion">{MENSAJES_CAMPANA.seccionVencimientos}</div>
          )}
          {vencimientos.map((n) => (
            <button
              key={n._id}
              type="button"
              data-testid="vencimiento-campana"
              className={`dropdown-item${n.leida ? '' : ' notificacion-no-leida'}`}
              onClick={() => onAbrirVencimiento(n)}
            >
              <div className="fw-semibold small">{n.nombreCandidato}</div>
              <div className="small">{n.nombreCurso}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                Vence {formatearFechaCalendarioMesCorto(n.fechaVencimiento)} ·{' '}
                {mensajeDiasRestantes(n.diasRestantes)}
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
