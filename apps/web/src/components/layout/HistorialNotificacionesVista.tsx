import type {
  GrupoNotificacionesApp,
  NotificacionAppItem,
  TipoNotificacionApp,
} from '@/lib/api/notificaciones';
import {
  ETIQUETA_TIPO,
  MENSAJES_CAMPANA,
  RUTA_NOTIFICACIONES,
  agruparPorDia,
  tituloDia,
  type Pestana,
} from '@/lib/notificacionesCampana';
import {
  AvisoFila,
  GrupoAvisos,
  PestanasNotificaciones,
  type AccionesAviso,
} from './PanelNotificaciones';

/**
 * Historial de /notificaciones (sin estado, para probarlo en Node).
 * - Sin filtro: grupos (tipo + día) bajo el encabezado de su día, paginados.
 * - Con tipo y/o día (viene de "Ver los N"): lista plana de ese grupo.
 */
export type HistorialNotificacionesVistaProps = AccionesAviso & {
  pestana: Pestana;
  filtro: { tipo?: TipoNotificacionApp; dia?: string };
  grupos: GrupoNotificacionesApp[];
  items: NotificacionAppItem[];
  noLeidas: number;
  pagina: number;
  totalPaginas: number;
  cargando: boolean;
  error: string | null;
  marcandoTodas?: boolean;
  ahora?: Date;
  onCambiarPestana: (p: Pestana) => void;
  onPagina: (pagina: number) => void;
  onMarcarGrupo: (grupo: GrupoNotificacionesApp) => void;
  onMarcarTodas: () => void;
  onReintentar: () => void;
  onNavegar: (href: string) => void;
};

export function HistorialNotificacionesVista({
  pestana,
  filtro,
  grupos,
  items,
  noLeidas,
  pagina,
  totalPaginas,
  cargando,
  error,
  marcandoTodas = false,
  ahora,
  onRevisar,
  onMarcarLeida,
  onCambiarPestana,
  onPagina,
  onMarcarGrupo,
  onMarcarTodas,
  onReintentar,
  onNavegar,
}: HistorialNotificacionesVistaProps) {
  const detalle = Boolean(filtro.tipo || filtro.dia);
  const vacio = detalle ? items.length === 0 : grupos.length === 0;
  const descripcionFiltro = [
    filtro.tipo ? ETIQUETA_TIPO[filtro.tipo] : 'Avisos',
    filtro.dia ? tituloDia(filtro.dia, ahora).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="container py-4 historial-notificaciones-asommmn" data-testid="historial-notificaciones">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0 historial-titulo">
          <i className="bi bi-compass me-2" aria-hidden="true" />
          {MENSAJES_CAMPANA.titulo}
        </h1>
        {noLeidas > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            data-testid="btn-marcar-todas"
            disabled={marcandoTodas}
            aria-busy={marcandoTodas || undefined}
            onClick={onMarcarTodas}
          >
            <i className="bi bi-check2-all me-1" aria-hidden="true" />
            {MENSAJES_CAMPANA.marcarTodas}
          </button>
        )}
      </div>

      <div className="card shadow-sm avisos-asommmn">
        <PestanasNotificaciones pestana={pestana} noLeidas={noLeidas} onCambiar={onCambiarPestana} />

        {detalle && (
          <div className="historial-filtro d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-2">
            <span className="small fw-semibold" data-testid="filtro-historial">
              {descripcionFiltro}
            </span>
            <a
              href={RUTA_NOTIFICACIONES}
              className="btn btn-link btn-sm p-0"
              data-testid="btn-quitar-filtro"
              onClick={(e) => {
                e.preventDefault();
                onNavegar(RUTA_NOTIFICACIONES);
              }}
            >
              {MENSAJES_CAMPANA.quitarFiltro}
            </a>
          </div>
        )}

        {error && (
          <div className="alert alert-danger small m-2 py-2 px-3" role="alert">
            <div>{error}</div>
            <button type="button" className="btn btn-link btn-sm p-0" onClick={onReintentar}>
              {MENSAJES_CAMPANA.reintentar}
            </button>
          </div>
        )}

        {cargando && (
          <div className="text-center text-muted py-4 small" role="status">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            {MENSAJES_CAMPANA.cargando}
          </div>
        )}

        {!cargando && !error && vacio && (
          <div className="text-center text-muted py-4 small">
            {pestana === 'no_leidas' ? MENSAJES_CAMPANA.vacioNoLeidas : MENSAJES_CAMPANA.vacio}
          </div>
        )}

        {!cargando && detalle && items.map((aviso) => (
          <AvisoFila
            key={aviso._id}
            aviso={aviso}
            ahora={ahora}
            onRevisar={onRevisar}
            onMarcarLeida={onMarcarLeida}
          />
        ))}

        {!cargando && !detalle &&
          agruparPorDia(grupos).map(({ dia, grupos: delDia }) => (
            <section key={dia} aria-label={tituloDia(dia, ahora)} data-testid="dia-historial">
              <h2 className="historial-dia">{tituloDia(dia, ahora)}</h2>
              {delDia.map((grupo) => (
                <GrupoAvisos
                  key={grupo.clave}
                  grupo={grupo}
                  ahora={ahora}
                  onRevisar={onRevisar}
                  onMarcarLeida={onMarcarLeida}
                  onMarcarGrupo={onMarcarGrupo}
                  onNavegar={onNavegar}
                />
              ))}
            </section>
          ))}
      </div>

      {totalPaginas > 1 && (
        <nav
          className="d-flex justify-content-between align-items-center mt-3"
          aria-label="Paginación de notificaciones"
        >
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            data-testid="btn-pagina-anterior"
            disabled={pagina <= 1 || cargando}
            onClick={() => onPagina(pagina - 1)}
          >
            <i className="bi bi-chevron-left me-1" aria-hidden="true" />
            {MENSAJES_CAMPANA.anterior}
          </button>
          <span className="small text-muted" data-testid="texto-pagina">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            data-testid="btn-pagina-siguiente"
            disabled={pagina >= totalPaginas || cargando}
            onClick={() => onPagina(pagina + 1)}
          >
            {MENSAJES_CAMPANA.siguiente}
            <i className="bi bi-chevron-right ms-1" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
