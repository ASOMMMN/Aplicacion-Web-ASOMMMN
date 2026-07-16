import { Card } from 'react-bootstrap';
import { IconAncla } from '@/components/ui/NauticalIcons';
import type { TiempoTotalMar } from './types';
import { formatTiempoTotal } from './formato';

export function TiempoTotalCard({ tiempoTotal }: { tiempoTotal: TiempoTotalMar }) {
  return (
    <Card className="card-enmv kpi-tiempo-mar">
      <Card.Body className="d-flex align-items-center gap-3">
        <IconAncla size={34} className="kpi-icono flex-shrink-0" />
        <div>
          <div className="kpi-label">Tiempo total de mar</div>
          <div className="kpi-valor">{formatTiempoTotal(tiempoTotal)}</div>
        </div>
      </Card.Body>
    </Card>
  );
}
