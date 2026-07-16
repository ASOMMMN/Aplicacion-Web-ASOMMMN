import { Badge, Button } from 'react-bootstrap';
import { IconBarco } from '@/components/ui/NauticalIcons';
import type { EmbarqueItem } from './types';
import { formatDuracion, formatFechaCorta } from './formato';

interface EmbarqueTimelineProps {
  embarques: EmbarqueItem[];
  onEditar?: (embarque: EmbarqueItem) => void;
  onEliminar?: (embarque: EmbarqueItem) => void;
}

export function EmbarqueTimeline({
  embarques,
  onEditar,
  onEliminar,
}: EmbarqueTimelineProps) {
  const editable = Boolean(onEditar || onEliminar);

  if (embarques.length === 0) {
    return (
      <div className="empty-state">
        <IconBarco size={16} />
        <span>Aún no hay embarques registrados.</span>
      </div>
    );
  }

  return (
    <div className="embarque-timeline">
      {embarques.map((embarque) => (
        <div key={embarque._id} className="card-enmv embarque-card">
          <div className="p-3">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
              <div className="d-flex align-items-center gap-2">
                <IconBarco size={20} className="nautical-icon flex-shrink-0" />
                <span className="fw-bold" style={{ color: 'var(--enmv-azul)', fontSize: '1.05rem' }}>
                  {embarque.nombreNave}
                </span>
              </div>
              <Badge className="badge-rango-embarque badge-pill-enmv">
                {embarque.rango}
              </Badge>
            </div>

            <div className="text-muted small mb-2">
              {embarque.naviera} · {embarque.tipoNave} · {embarque.bandera}
            </div>

            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="small">
                {formatFechaCorta(embarque.fechaEmbarco)} → {formatFechaCorta(embarque.fechaDesembarco)}
              </span>
              <span className="duracion-pill">{formatDuracion(embarque.duracion)}</span>
            </div>

            {editable && (
              <div className="d-flex gap-2 mt-3">
                {onEditar && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => onEditar(embarque)}
                  >
                    <i className="bi bi-pencil me-1" />
                    Editar
                  </Button>
                )}
                {onEliminar && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onEliminar(embarque)}
                  >
                    <i className="bi bi-trash me-1" />
                    Eliminar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
