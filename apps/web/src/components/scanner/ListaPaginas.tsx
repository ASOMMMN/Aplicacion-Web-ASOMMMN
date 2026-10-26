'use client';

export interface MiniaturaPagina {
  id: string;
  url: string;
}

interface Props {
  paginas: MiniaturaPagina[];
  seleccionada: string | null;
  onSeleccionar: (id: string) => void;
  onMover: (id: string, direccion: -1 | 1) => void;
  onEliminar: (id: string) => void;
  deshabilitado?: boolean;
}

/** Tira de páginas: tocar para editar, flechas para reordenar, papelera para quitar. */
export function ListaPaginas({ paginas, seleccionada, onSeleccionar, onMover, onEliminar, deshabilitado }: Props) {
  return (
    <ol className="escaner-paginas" aria-label="Páginas del documento">
      {paginas.map((p, i) => {
        const activa = p.id === seleccionada;
        return (
          <li key={p.id} className={`escaner-pagina ${activa ? 'activa' : ''}`}>
            <button
              type="button"
              className="escaner-miniatura"
              onClick={() => onSeleccionar(p.id)}
              aria-current={activa ? 'true' : undefined}
              aria-label={`Página ${i + 1}${activa ? ' (seleccionada)' : ''}`}
              disabled={deshabilitado}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, no aplica next/image */}
              <img src={p.url} alt="" />
              <span className="escaner-numero">{i + 1}</span>
            </button>
            <div className="escaner-pagina-acciones">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onMover(p.id, -1)}
                disabled={deshabilitado || i === 0}
                aria-label={`Mover página ${i + 1} antes`}
              >
                <i className="bi bi-chevron-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => onEliminar(p.id)}
                disabled={deshabilitado}
                aria-label={`Eliminar página ${i + 1}`}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onMover(p.id, 1)}
                disabled={deshabilitado || i === paginas.length - 1}
                aria-label={`Mover página ${i + 1} después`}
              >
                <i className="bi bi-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
