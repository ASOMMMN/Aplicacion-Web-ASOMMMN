import type { MouseEvent, ReactNode } from 'react';
import type {
  GrupoNotificacionesApp,
  NotificacionAppItem,
  NotificacionItem,
} from '@/lib/api/notificaciones';
import { formatearFechaCalendarioMesCorto } from '@/lib/fechas';
import {
  ICONO_AVISO,
  MENSAJES_CAMPANA,
  PESTANAS,
  RUTA_NOTIFICACIONES,
  enlaceCandidato,
  enlaceDetalleGrupo,
  fechaCompleta,
  fechaRelativa,
  textoContador,
  type Pestana,
} from '@/lib/notificacionesCampana';

/**
 * Vistas sin estado de la campanita y del historial (/notificaciones). No
 * usan el contexto del Dropdown, así que se pueden renderizar en pruebas con
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

/** Enlace interno que navega con el router (sin recargar). */
function EnlaceInterno({
  href,
  onNavegar,
  className,
  testId,
  children,
}: {
  href: string;
  onNavegar: (href: string) => void;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      data-testid={testId}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        onNavegar(href);
      }}
    >
      {children}
    </a>
  );
}

// ── Pestañas ────────────────────────────────────────────────────────────────

export function PestanasNotificaciones({
  pestana,
  noLeidas,
  onCambiar,
}: {
  pestana: Pestana;
  noLeidas: number;
  onCambiar: (p: Pestana) => void;
}) {
  return (
    <div className="pestanas-avisos" role="tablist" aria-label="Filtrar notificaciones">
      {PESTANAS.map(({ valor, etiqueta }) => {
        const activa = valor === pestana;
        return (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={activa}
            data-testid={`pestana-${valor}`}
            className={`btn btn-sm pestana-aviso${activa ? ' activa' : ''}`}
            onClick={() => {
              if (!activa) onCambiar(valor);
            }}
          >
            {etiqueta}
            {valor === 'no_leidas' && noLeidas > 0 && (
              <span className="ms-1">({textoContador(noLeidas)})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Un aviso ────────────────────────────────────────────────────────────────

export type AccionesAviso = {
  /** Marca leído y navega a /candidato/<id>. */
  onRevisar: (aviso: NotificacionAppItem) => void;
  onMarcarLeida: (aviso: NotificacionAppItem) => void;
};

export function AvisoFila({
  aviso,
  ahora,
  onRevisar,
  onMarcarLeida,
}: { aviso: NotificacionAppItem; ahora?: Date } & AccionesAviso) {
  return (
    <div
      data-testid="aviso-campana"
      data-leida={aviso.leida ? 'true' : 'false'}
      className={`aviso-fila${aviso.leida ? '' : ' notificacion-no-leida'}`}
    >
      <i
        className={`bi ${ICONO_AVISO[aviso.tipo] ?? 'bi-bell'} aviso-campana-icono`}
        aria-hidden="true"
      />
      <div className="flex-grow-1 min-w-0">
        <div className="small">
          {!aviso.leida && <span className="visually-hidden">Sin leer: </span>}
          {aviso.mensaje}
        </div>
        <time
          className="d-block text-muted aviso-fecha"
          dateTime={aviso.fecha}
          title={fechaCompleta(aviso.fecha)}
        >
          {fechaRelativa(aviso.fecha, ahora)}
        </time>
        <div className="aviso-acciones">
          <a
            href={enlaceCandidato(aviso)}
            className="btn btn-link"
            data-testid="btn-revisar-expediente"
            onClick={(e) => {
              e.preventDefault();
              onRevisar(aviso);
            }}
          >
            <i className="bi bi-box-arrow-up-right me-1" aria-hidden="true" />
            {MENSAJES_CAMPANA.revisarExpediente}
          </a>
          {!aviso.leida && (
            <button
              type="button"
              className="btn btn-link"
              data-testid="btn-marcar-leida"
              onClick={() => onMarcarLeida(aviso)}
            >
              <i className="bi bi-check2 me-1" aria-hidden="true" />
              {MENSAJES_CAMPANA.marcarLeida}
            </button>
          )}
        </div>
      </div>
      {!aviso.leida && <span className="aviso-campana-punto" aria-hidden="true" />}
    </div>
  );
}

// ── Grupo del día ───────────────────────────────────────────────────────────

/**
 * Un aviso solo se ve tal cual; varios del mismo tipo y día se resumen en
 * una línea ("5 postulantes nuevos hoy") que se despliega con el detalle.
 */
export function GrupoAvisos({
  grupo,
  ahora,
  onRevisar,
  onMarcarLeida,
  onMarcarGrupo,
  onNavegar,
}: {
  grupo: GrupoNotificacionesApp;
  ahora?: Date;
  onMarcarGrupo?: (grupo: GrupoNotificacionesApp) => void;
  onNavegar: (href: string) => void;
} & AccionesAviso) {
  if (grupo.cantidad === 1 && grupo.items.length === 1) {
    return (
      <AvisoFila
        aviso={grupo.items[0]}
        ahora={ahora}
        onRevisar={onRevisar}
        onMarcarLeida={onMarcarLeida}
      />
    );
  }
  return (
    <details
      className={`grupo-avisos${grupo.noLeidas > 0 ? ' notificacion-no-leida' : ''}`}
      data-testid="grupo-avisos"
      data-clave={grupo.clave}
    >
      <summary className="grupo-avisos-resumen">
        <i
          className={`bi ${ICONO_AVISO[grupo.tipo] ?? 'bi-bell'} aviso-campana-icono`}
          aria-hidden="true"
        />
        <span className="flex-grow-1 min-w-0">
          <span className="d-block small fw-semibold">{grupo.resumen}</span>
          <time
            className="d-block text-muted aviso-fecha"
            dateTime={grupo.fecha}
            title={fechaCompleta(grupo.fecha)}
          >
            Último {fechaRelativa(grupo.fecha, ahora)}
          </time>
        </span>
        {grupo.noLeidas > 0 && (
          <span className="badge rounded-pill badge-grupo-avisos">
            {grupo.noLeidas}
            <span className="visually-hidden"> sin leer</span>
          </span>
        )}
        <i className="bi bi-chevron-down grupo-avisos-flecha" aria-hidden="true" />
      </summary>
      <div className="grupo-avisos-detalle">
        {grupo.items.map((aviso) => (
          <AvisoFila
            key={aviso._id}
            aviso={aviso}
            ahora={ahora}
            onRevisar={onRevisar}
            onMarcarLeida={onMarcarLeida}
          />
        ))}
        {(grupo.hayMas || (onMarcarGrupo && grupo.noLeidas > 0)) && (
          <div className="grupo-avisos-pie">
            {grupo.hayMas && (
              <EnlaceInterno
                href={enlaceDetalleGrupo(grupo)}
                onNavegar={onNavegar}
                className="btn btn-link"
                testId="btn-detalle-grupo"
              >
                {MENSAJES_CAMPANA.verDetalleGrupo} {grupo.cantidad}
              </EnlaceInterno>
            )}
            {onMarcarGrupo && grupo.noLeidas > 0 && (
              <button
                type="button"
                className="btn btn-link"
                data-testid="btn-marcar-grupo"
                onClick={() => onMarcarGrupo(grupo)}
              >
                {MENSAJES_CAMPANA.marcarGrupo}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ── Panel de la campanita ───────────────────────────────────────────────────

function mensajeDiasRestantes(dias: number) {
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Vence en 1 día';
  return `Vence en ${dias} días`;
}

export type PanelNotificacionesVistaProps = AccionesAviso & {
  grupos: GrupoNotificacionesApp[];
  vencimientos: NotificacionItem[];
  /** Total sin leer (avisos + vencimientos). */
  noLeidas: number;
  pestana: Pestana;
  cargando: boolean;
  error: string | null;
  marcandoTodas?: boolean;
  ahora?: Date;
  onCambiarPestana: (p: Pestana) => void;
  onAbrirVencimiento: (vencimiento: NotificacionItem) => void;
  onMarcarTodas: () => void;
  onReintentar: () => void;
  onNavegar: (href: string) => void;
};

export function PanelNotificacionesVista({
  grupos,
  vencimientos: todosVencimientos,
  noLeidas,
  pestana,
  cargando,
  error,
  marcandoTodas = false,
  ahora,
  onRevisar,
  onMarcarLeida,
  onCambiarPestana,
  onAbrirVencimiento,
  onMarcarTodas,
  onReintentar,
  onNavegar,
}: PanelNotificacionesVistaProps) {
  const vencimientos =
    pestana === 'no_leidas' ? todosVencimientos.filter((n) => !n.leida) : todosVencimientos;
  const vacio = grupos.length === 0 && vencimientos.length === 0;

  return (
    <div data-testid="panel-notificaciones" className="avisos-asommmn">
      <div className="panel-notificaciones-encabezado">
        <div className="d-flex justify-content-between align-items-center gap-2 px-3 py-2">
          <span className="fw-semibold small text-nowrap">
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
        <PestanasNotificaciones
          pestana={pestana}
          noLeidas={noLeidas}
          onCambiar={onCambiarPestana}
        />
      </div>

      {error && (
        <div className="alert alert-danger small m-2 py-2 px-3" role="alert">
          <div>{error}</div>
          <button type="button" className="btn btn-link btn-sm p-0" onClick={onReintentar}>
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
        <div className="text-center text-muted py-3 small">
          {pestana === 'no_leidas' ? MENSAJES_CAMPANA.vacioNoLeidas : MENSAJES_CAMPANA.vacio}
        </div>
      )}

      {grupos.length > 0 && (
        <section aria-label={MENSAJES_CAMPANA.seccionCandidatos}>
          {vencimientos.length > 0 && (
            <div className="panel-notificaciones-seccion">{MENSAJES_CAMPANA.seccionCandidatos}</div>
          )}
          {grupos.map((grupo) => (
            <GrupoAvisos
              key={grupo.clave}
              grupo={grupo}
              ahora={ahora}
              onRevisar={onRevisar}
              onMarcarLeida={onMarcarLeida}
              onNavegar={onNavegar}
            />
          ))}
        </section>
      )}

      {vencimientos.length > 0 && (
        <section aria-label={MENSAJES_CAMPANA.seccionVencimientos}>
          {grupos.length > 0 && (
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

      <div className="panel-notificaciones-pie">
        <EnlaceInterno
          href={RUTA_NOTIFICACIONES}
          onNavegar={onNavegar}
          className="btn btn-link btn-sm"
          testId="btn-ver-todas"
        >
          {MENSAJES_CAMPANA.verTodas}
          <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
        </EnlaceInterno>
      </div>
    </div>
  );
}
