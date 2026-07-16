'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Row,
} from 'react-bootstrap';
import Link from 'next/link';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { SpinnerTimon, IconBarco } from '@/components/ui/NauticalIcons';
import { ComentarioCard, type ComentarioCardItem } from '@/components/ComentarioCard';
import type { BitacoraEmbarqueResponse } from '@/components/bitacora-embarque/types';
import { formatTiempoTotal } from '@/components/bitacora-embarque/formato';

interface Perfil {
  usuarioId: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  ciudad?: string;
  pais?: string;
  vacante?: string;
  estadoPostulacion: 'en_proceso' | 'completado' | 'rechazado';
  estadoExpediente: 'en_proceso' | 'enviado';
  enviadoEn?: string;
  creadoEn: string;
}

interface RequisitoItem {
  clave: string;
  label: string;
  cumplido: boolean;
  urlFrontend: string;
}

interface ExpedienteProgress {
  porcentaje: number;
  total: number;
  cumplidos: number;
  requisitos: RequisitoItem[];
  estadoExpediente: 'en_proceso' | 'enviado';
  puedeEnviar: boolean;
  enviadoEn?: string;
}

interface CV {
  _id: string;
  nombreOriginal: string;
  tamanio: number;
  version: number;
  subidasEn: string;
}

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

export default function DashboardPostulantePage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cv, setCV] = useState<CV | null>(null);
  const [expediente, setExpediente] = useState<ExpedienteProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [comentarios, setComentarios] = useState<ComentarioCardItem[]>([]);
  const [mostrarHistorialComentarios, setMostrarHistorialComentarios] = useState(false);
  const [bitacora, setBitacora] = useState<BitacoraEmbarqueResponse | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [perfilRes, cvRes, comentariosRes, expedienteRes, bitacoraRes] = await Promise.all([
        api.get<Perfil>('/postulantes/mi-perfil'),
        api.get<CV>('/documentos/mi-cv').catch(() => ({ data: null })),
        api.get<ComentarioCardItem[]>('/evaluaciones/mis-comentarios').catch(() => ({ data: [] })),
        api.get<ExpedienteProgress>('/postulantes/mi-expediente').catch(() => ({ data: null })),
        api.get<BitacoraEmbarqueResponse>('/bitacora-embarque/mis-embarques').catch(() => ({ data: null })),
      ]);
      setPerfil(perfilRes.data);
      setCV(cvRes.data);
      setComentarios(Array.isArray(comentariosRes.data) ? comentariosRes.data : []);
      setExpediente(expedienteRes.data);
      setBitacora(bitacoraRes.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? 'Error al cargar el dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => { await cargarDatos(); };
    init();
  }, [cargarDatos]);

  const handleFinalizar = async () => {
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Finalizar postulación?',
      html: `
        <p>Tu expediente quedará marcado como <strong>Enviado</strong>.<br/>
        Podrás seguir consultando tus documentos, pero ya no podrás modificar el estado.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0A2240',
    });
    if (!conf.isConfirmed) return;

    try {
      setEnviando(true);
      await api.post('/postulantes/finalizar-postulacion');
      await Swal.fire({
        icon: 'success',
        title: '¡Postulación enviada!',
        text: 'Tu expediente ha sido registrado exitosamente.',
        confirmButtonColor: '#0A2240',
      });
      await cargarDatos();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo enviar',
        text: toErrorMessage(axiosErr.response?.data?.message ?? 'Error al finalizar la postulación'),
        confirmButtonColor: '#0A2240',
      });
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante d-flex align-items-center justify-content-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  if (!perfil) {
    return (
      <Container className="py-5">
        <Alert variant="danger">No se pudo cargar tu perfil.</Alert>
      </Container>
    );
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES');
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const pct = expediente?.porcentaje ?? 0;
  const enviado = expediente?.estadoExpediente === 'enviado' || perfil.estadoExpediente === 'enviado';

  return (
    <div className="py-4 nautical-panel nautical-panel-postulante" style={{ minHeight: '100vh' }}>
      <Container>

        {/* Header */}
        <Row className="align-items-end mb-4 g-3">
          <Col lg={8}>
            <span className="badge badge-pill-enmv badge-estado-proceso mb-2">Postulación</span>
            <h1 className="section-title">
              Bienvenida, {perfil.nombre}
            </h1>
            <p className="text-muted mb-0">
              {perfil.email} · Registrada el {formatDate(perfil.creadoEn)}
            </p>
          </Col>
          <Col lg={4} className="text-lg-end d-flex gap-2 justify-content-lg-end flex-wrap">
            <Link href="/mi-perfil" className="btn btn-outline-primary">
              Editar perfil
            </Link>
            <Link href="/mi-cv" className="btn btn-primary">
              Gestionar CV
            </Link>
          </Col>
        </Row>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="horizonte-divider" />

        {/* Barra de progreso del expediente */}
        <Row className="mb-4">
          <Col>
            <Card className={`card-enmv card-riveted ${enviado ? 'card-enmv-top-verde' : 'card-enmv-top-dorado'}`}>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
                  <div>
                    <h5 className="section-title mb-1">
                      <i className="bi bi-compass nautical-icon" />
                      {enviado ? '✅ Expediente enviado' : 'Tu expediente'}
                    </h5>
                    {enviado && expediente?.enviadoEn && (
                      <p className="text-muted small mb-0">
                        Enviado el {formatDate(expediente.enviadoEn)}
                      </p>
                    )}
                    {!enviado && (
                      <p className="text-muted small mb-0">
                        Completa todos los requisitos para enviar tu postulación.
                      </p>
                    )}
                  </div>
                  <div className="text-end">
                    <span
                      className="fw-bold"
                      style={{ fontSize: '1.6rem', color: pct === 100 ? 'var(--enmv-verde)' : 'var(--enmv-dorado)' }}
                    >
                      {pct}%
                    </span>
                    {enviado && (
                      <span className="badge badge-pill-enmv badge-estado-aprobado ms-2">
                        Enviado
                      </span>
                    )}
                  </div>
                </div>

                {/* Barra galón */}
                <div
                  className="mb-3 rounded overflow-hidden"
                  style={{ height: 10, background: 'rgba(10,34,64,.12)' }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: pct === 100
                        ? 'var(--enmv-verde)'
                        : `linear-gradient(90deg, var(--enmv-dorado), var(--enmv-azul))`,
                      transition: 'width .5s ease',
                    }}
                  />
                </div>

                {/* Checklist */}
                {expediente && (
                  <div className="row g-2">
                    {expediente.requisitos.map((req) => (
                      <div key={req.clave} className="col-sm-6 col-lg-4">
                        <Link
                          href={req.urlFrontend}
                          className="requisito-checklist-item d-flex align-items-center gap-2 rounded px-3 py-2 text-decoration-none"
                          style={{
                            background: req.cumplido ? 'rgba(29,158,117,.08)' : 'rgba(201,162,75,.08)',
                            border: `1px solid ${req.cumplido ? 'var(--enmv-verde)' : 'var(--enmv-dorado)'}`,
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>
                            {req.cumplido ? '✅' : '❌'}
                          </span>
                          <span className="small fw-semibold flex-grow-1" style={{ color: 'var(--enmv-azul)' }}>
                            {req.label}
                          </span>
                          <span className="requisito-chevron fw-bold" style={{ fontSize: '1rem' }}>
                            ›
                          </span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ítem opcional — distinto del checklist obligatorio: no bloquea nada */}
                <div className="mt-3">
                  <Link
                    href="/mi-bitacora-embarque"
                    data-testid="link-bitacora-embarque"
                    className="item-opcional-bitacora d-flex align-items-center gap-2 rounded px-3 py-2 text-decoration-none"
                  >
                    <span style={{ color: 'var(--enmv-dorado)' }}>
                      <IconBarco size={18} />
                    </span>
                    <span className="small fw-semibold flex-grow-1" style={{ color: 'var(--enmv-azul)' }}>
                      Bitácora de Embarque
                      <span className="badge badge-opcional-enmv badge-pill-enmv ms-2" style={{ fontSize: '0.65rem' }}>
                        Opcional
                      </span>
                    </span>
                    {bitacora && bitacora.total > 0 ? (
                      <span className="text-muted small">{formatTiempoTotal(bitacora.tiempoTotal)}</span>
                    ) : null}
                    <span className="fw-bold" style={{ fontSize: '1rem', color: 'var(--enmv-dorado)' }}>›</span>
                  </Link>
                </div>

                {/* Botón Finalizar */}
                {!enviado && (
                  <div className="mt-4 d-flex align-items-center gap-3 flex-wrap">
                    <Button
                      style={{
                        background: pct === 100 ? 'var(--enmv-azul)' : undefined,
                        borderColor: pct === 100 ? 'var(--enmv-azul)' : undefined,
                      }}
                      variant={pct === 100 ? 'primary' : 'secondary'}
                      disabled={pct < 100 || enviando}
                      onClick={() => void handleFinalizar()}
                    >
                      {enviando ? (
                        <><SpinnerTimon size={14} className="me-2" />Enviando…</>
                      ) : (
                        '🚀 Finalizar postulación'
                      )}
                    </Button>
                    {pct < 100 && expediente && (
                      <span className="text-muted small">
                        Faltan {expediente.total - expediente.cumplidos} requisito{expediente.total - expediente.cumplidos !== 1 ? 's' : ''}.
                      </span>
                    )}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Vacante capturada */}
        {perfil.vacante && (
          <Row className="mb-4">
            <Col>
              <Card className="card-enmv card-enmv-top-azul">
                <Card.Body className="d-flex align-items-center gap-3 flex-wrap">
                  <div className="flex-grow-1">
                    <div className="text-muted small mb-1">Vacante a la que aplicas</div>
                    <span className="pennant-vacante" style={{ fontSize: '0.9rem' }}>
                      {perfil.vacante}
                    </span>
                  </div>
                  {!enviado && (
                    <Link href="/mi-perfil" className="btn btn-sm btn-outline-primary">
                      Editar
                    </Link>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        <div className="horizonte-divider" />

        {/* CV + comentarios */}
        <Row className="mb-4 g-3">
          <Col lg={6}>
            <Card className="card-enmv card-enmv-top-verde h-100">
              <Card.Body>
                <h5 className="section-title mb-3">Tu CV</h5>
                {cv ? (
                  <>
                    <div className="bg-light p-3 rounded mb-3">
                      <p className="small mb-1"><strong>{cv.nombreOriginal}</strong></p>
                      <p className="text-muted small mb-0">
                        Versión {cv.version} · {formatFileSize(cv.tamanio)} · {formatDate(cv.subidasEn)}
                      </p>
                    </div>
                    <Link href="/mi-cv" className="btn btn-outline-primary btn-sm me-2">Cargar nuevo</Link>
                    <Link href="/mi-cv" className="btn btn-outline-secondary btn-sm">Historial</Link>
                  </>
                ) : (
                  <>
                    <p className="text-muted small mb-3">No has subido tu CV aún.</p>
                    <Link href="/mi-cv" className="btn btn-primary btn-sm">Cargar CV</Link>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={6}>
            <Card className="card-enmv card-enmv-top-dorado h-100">
              <Card.Body>
                <h5 className="section-title mb-3">Comentarios del evaluador</h5>
                {comentarios.length === 0 ? (
                  <p className="text-muted small mb-0">
                    Los comentarios aparecerán aquí cuando el evaluador revise tu expediente.
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    <ComentarioCard item={comentarios[0]} />

                    {comentarios.length > 1 && (
                      <>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          className="align-self-start"
                          onClick={() => setMostrarHistorialComentarios((v) => !v)}
                        >
                          <i
                            className={`bi ${mostrarHistorialComentarios ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`}
                          />
                          {mostrarHistorialComentarios
                            ? 'Ocultar historial'
                            : `Ver historial completo (${comentarios.length - 1} más)`}
                        </Button>

                        {mostrarHistorialComentarios && (
                          <div className="d-flex flex-column gap-2">
                            {comentarios.slice(1).map((item) => (
                              <ComentarioCard key={item.id} item={item} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
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
