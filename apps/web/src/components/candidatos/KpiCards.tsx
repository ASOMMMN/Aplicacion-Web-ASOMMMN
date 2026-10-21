'use client';

import { Card, Col, Placeholder, Row } from 'react-bootstrap';
import { ESTADO_GENERAL_CONFIG, type EstadoGeneral } from '@/lib/estadoCandidato';
import type { ResumenCandidatos, Vista } from '@/hooks/useCandidatosQuery';

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

interface TarjetaEstadoConfig {
  estado: EstadoGeneral;
  label: string;
  topClass: string;
  color: string;
}

const TARJETAS_ESTADO: TarjetaEstadoConfig[] = [
  { estado: 'completo', label: 'Completos', topClass: 'card-asommmn-top-verde', color: '#1D9E75' },
  { estado: 'enviado', label: 'Enviados', topClass: 'card-asommmn-top-azul', color: 'var(--asommmn-azul)' },
  { estado: 'en_proceso', label: 'En proceso', topClass: 'card-asommmn-top-dorado', color: 'var(--asommmn-dorado)' },
  { estado: 'incompleto', label: 'Incompletos', topClass: 'card-asommmn-top-rojo', color: '#C0392B' },
  { estado: 'evaluado', label: 'Evaluados', topClass: 'card-asommmn-top-verde', color: '#0F6E4F' },
];

export function KpiCards({
  resumen,
  estadosActivos,
  vista,
  onToggleEstado,
}: {
  resumen: ResumenCandidatos | null;
  estadosActivos: EstadoGeneral[];
  vista: Vista;
  onToggleEstado: (estado: EstadoGeneral) => void;
}) {
  return (
    <Row className="g-3 mb-4">
      <Col md={4} lg={2}>
        <Card className="card-asommmn card-asommmn-top-azul card-riveted h-100">
          <Card.Body>
            <div className="text-muted small">{vista === 'papelera' ? 'En la papelera' : 'Visibles'}</div>
            <div className="fs-3 fw-bold" style={{ color: 'var(--asommmn-azul)' }}>
              {resumen ? resumen.total : <Placeholder xs={6} />}
            </div>
          </Card.Body>
        </Card>
      </Col>
      {TARJETAS_ESTADO.map((cfg) => {
        const activa = estadosActivos.includes(cfg.estado);
        return (
          <Col md={4} lg={2} key={cfg.estado}>
            <Card
              className={`card-asommmn ${cfg.topClass} card-riveted h-100`}
              style={{
                cursor: 'pointer',
                outline: activa ? `2px solid ${cfg.color}` : 'none',
                outlineOffset: -2,
              }}
              onClick={() => onToggleEstado(cfg.estado)}
              role="button"
              tabIndex={0}
              aria-pressed={activa}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleEstado(cfg.estado);
                }
              }}
            >
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <EstadoDot estado={cfg.estado} />
                  <span className="text-muted small">{cfg.label}</span>
                </div>
                <div className="fs-3 fw-bold" style={{ color: cfg.color }}>
                  {resumen ? resumen[cfg.estado] : <Placeholder xs={6} />}
                </div>
              </Card.Body>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
