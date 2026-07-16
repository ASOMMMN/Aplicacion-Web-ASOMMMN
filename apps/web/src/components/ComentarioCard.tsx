'use client';

import { Badge } from 'react-bootstrap';

export type EstadoComentario = 'en_proceso' | 'completado' | 'rechazado';

export interface ComentarioCardItem {
  id: string;
  comentario: string;
  calificacion?: number;
  estadoSugerido: EstadoComentario;
  evaluadorNombre: string;
  creadoEn: string;
}

const estadoLabel: Record<EstadoComentario, string> = {
  en_proceso: 'En proceso',
  completado: 'Completado',
  rechazado: 'Rechazado',
};

const estadoIconClass: Record<EstadoComentario, string> = {
  en_proceso: 'bi-clock',
  completado: 'bi-check-lg',
  rechazado: 'bi-x-lg',
};

const estadoColor: Record<EstadoComentario, string> = {
  en_proceso: 'warning',
  completado: 'success',
  rechazado: 'danger',
};

const formatFecha = (date: string) =>
  new Date(date).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function ComentarioCard({ item }: { item: ComentarioCardItem }) {
  return (
    <div className="border rounded p-3 bg-light">
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <div className="fw-semibold">{item.evaluadorNombre}</div>
          <div className="text-muted small">{formatFecha(item.creadoEn)}</div>
        </div>
        <div className="text-end">
          <Badge bg={estadoColor[item.estadoSugerido]} className="badge-pill-enmv">
            <i className={`bi ${estadoIconClass[item.estadoSugerido]}`} />
            {estadoLabel[item.estadoSugerido]}
          </Badge>
          <div className="small text-muted mt-1">
            Calificacion: {item.calificacion ?? '-'}
          </div>
        </div>
      </div>
      <p className="small mb-0 mt-2">{item.comentario}</p>
    </div>
  );
}
