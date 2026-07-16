'use client';

import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Alert, Badge } from 'react-bootstrap';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';

interface Perfil {
  estadoPostulacion: 'en_proceso' | 'completado' | 'rechazado';
}

interface ComentarioEvaluacion {
  id: string;
  comentario: string;
  calificacion?: number;
  estadoSugerido: 'en_proceso' | 'completado' | 'rechazado';
  evaluadorNombre: string;
  creadoEn: string;
}

export default function EstadoPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioEvaluacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarEstado = async () => {
      try {
        setLoading(true);
        const [perfilRes, comentariosRes] = await Promise.all([
          api.get('/postulantes/mi-perfil'),
          api.get('/evaluaciones/mis-comentarios').catch(() => ({ data: [] })),
        ]);
        setPerfil(perfilRes.data);
        setComentarios(Array.isArray(comentariosRes.data) ? comentariosRes.data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    cargarEstado();
  }, []);

  if (loading) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante d-flex align-items-center justify-content-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  if (!perfil) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante py-5">
        <div className="mb-3">
          <BotonVolver />
        </div>
        <Alert variant="danger">No se pudo cargar tu estado.</Alert>
      </Container>
    );
  }

  const estadoInfo = {
    en_proceso: {
      color: 'warning',
      label: 'En Proceso',
      descripcion:
        'Tu postulación está siendo procesada. Completa tu perfil y sube tu CV para avanzar.',
      icon: '⏳',
    },
    completado: {
      color: 'success',
      label: 'Completado',
      descripcion: '¡Tu postulación ha sido completada exitosamente!',
      icon: '✓',
    },
    rechazado: {
      color: 'danger',
      label: 'Rechazado',
      descripcion:
        'Lamentablemente tu postulación no fue aceptada. Puedes intentarlo nuevamente en futuras convocatorias.',
      icon: '✕',
    },
  };

  const info = estadoInfo[perfil.estadoPostulacion];

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const estadoColor = {
    en_proceso: 'warning',
    completado: 'success',
    rechazado: 'danger',
  } as const;

  const estadoLabel = {
    en_proceso: 'En Proceso',
    completado: 'Completado',
    rechazado: 'Rechazado',
  } as const;

  const estadoIconClass = {
    en_proceso: 'bi-clock',
    completado: 'bi-check-lg',
    rechazado: 'bi-x-lg',
  } as const;

  const cardTopClass = {
    en_proceso: 'card-enmv-top-dorado',
    completado: 'card-enmv-top-verde',
    rechazado: 'card-enmv-top-rojo',
  } as const;

  return (
    <div className="min-vh-100 nautical-panel nautical-panel-postulante py-4">
      <Container>
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col lg={8}>
            <Card className={`card-enmv ${cardTopClass[perfil.estadoPostulacion]} card-riveted`}>
              <Card.Body className="p-4 text-center">
                <div className="mb-3" style={{ fontSize: '48px' }}>
                  {info.icon}
                </div>
                <h2 className="section-title mb-2">
                  <i className="bi bi-compass nautical-icon" />
                  Estado de Postulación
                </h2>
                <Badge bg={info.color} className="badge-pill-enmv mb-3">
                  <i className={`bi ${estadoIconClass[perfil.estadoPostulacion]}`} />
                  {info.label}
                </Badge>
                <p className="text-muted mb-0">
                  {info.descripcion}
                </p>
              </Card.Body>
            </Card>

            <div className="horizonte-divider" />

            {/* Comentarios (Fase 3) */}
            <Card className="card-enmv card-enmv-top-azul">
              <Card.Body className="p-4">
                <h5 className="section-title mb-3">Comentarios del Evaluador</h5>
                {comentarios.length === 0 ? (
                  <p className="text-muted small mb-0">
                    Los comentarios aparecerán aquí cuando el evaluador revise tu CV.
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {comentarios.map((item) => (
                      <div key={item.id} className="border rounded p-3 bg-light">
                        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                          <div>
                            <div className="fw-semibold">{item.evaluadorNombre}</div>
                            <div className="small text-muted">{formatDateTime(item.creadoEn)}</div>
                          </div>
                          <div className="text-end">
                            <Badge bg={estadoColor[item.estadoSugerido]} className="badge-pill-enmv">
                              <i className={`bi ${estadoIconClass[item.estadoSugerido]}`} />
                              {estadoLabel[item.estadoSugerido]}
                            </Badge>
                            <div className="small text-muted mt-1">
                              Calificación: {item.calificacion ?? '-'}
                            </div>
                          </div>
                        </div>
                        <p className="small mb-0 mt-2">{item.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
