'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Row,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';

// ── Tipos ────────────────────────────────────────────────────────────────────

type TipoDoc =
  | 'CURP'
  | 'INE'
  | 'acta_nacimiento'
  | 'visa'
  | 'pasaporte'
  | 'vacuna_fiebre_amarilla'
  | 'constancia_participacion'
  | 'certificado_medico'
  | 'libreta_identidad_maritima'
  | 'certificado_competencia';

const TIPOS_DOC_IDENTIDAD: { tipo: TipoDoc; label: string; icon: string }[] = [
  { tipo: 'CURP',                   label: 'CURP',                       icon: '🪪' },
  { tipo: 'INE',                    label: 'INE',                        icon: '🪪' },
  { tipo: 'acta_nacimiento',        label: 'Acta de nacimiento',         icon: '📄' },
  { tipo: 'visa',                   label: 'Visa',                       icon: '✈️' },
  { tipo: 'pasaporte',              label: 'Pasaporte',                  icon: '📔' },
  { tipo: 'vacuna_fiebre_amarilla', label: 'Vacuna de fiebre amarilla',  icon: '💉' },
];

const TIPOS_DOC_MARITIMOS: { tipo: TipoDoc; label: string; icon: string }[] = [
  { tipo: 'constancia_participacion',    label: 'Constancia de participación',      icon: '📜' },
  { tipo: 'certificado_medico',          label: 'Certificado médico',               icon: '🩺' },
  { tipo: 'libreta_identidad_maritima',  label: 'Libreta de identidad marítima',    icon: '📘' },
  { tipo: 'certificado_competencia',     label: 'Certificado de competencia',       icon: '🎓' },
];

const TIPOS_DOC = [...TIPOS_DOC_IDENTIDAD, ...TIPOS_DOC_MARITIMOS];

const TIPOS_DOC_REQUERIDOS = TIPOS_DOC.filter((t) => t.tipo !== 'visa');

interface DocFile {
  _id: string;
  tipo: TipoDoc;
  nombreOriginal: string;
  tamanio: number;
  tipoMime: string;
  subidasEn: string;
  urlDescargar?: string;
  storageType?: 'local' | 'cloudinary';
}

interface TipoResumen {
  tipo: TipoDoc;
  label: string;
  cantidad: number;
  archivos: DocFile[];
}

interface MisDocsResponse {
  tipos: TipoResumen[];
  totalArchivos: number;
  tiposConArchivos: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const toError = (e: unknown): string => {
  if (Array.isArray(e)) return e.map(String).join(', ');
  if (e && typeof e === 'object' && 'message' in e)
    return toError((e as { message?: unknown }).message);
  return String(e ?? 'Error inesperado');
};

const ACCEPTED = '.pdf,.jpg,.jpeg,.png';

// ── Componente por tipo ────────────────────────────────────────────────────────

function TarjetaTipo({
  info,
  onUploaded,
}: {
  info: TipoResumen & { icon: string };
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setErr('Solo se aceptan PDF, JPG o PNG.');
      return;
    }
    setErr('');
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('tipo', info.tipo);

    try {
      await api.post('/docs-personales/subir', formData, {
        onUploadProgress: (e) =>
          setProgress(Math.round(((e.loaded ?? 0) * 100) / (e.total ?? 1))),
      });
      await Swal.fire({
        icon: 'success',
        title: 'Archivo subido',
        text: `${file.name} guardado como ${info.label}.`,
        timer: 1800,
        showConfirmButton: false,
      });
      onUploaded();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: unknown } } };
      setErr(toError(axiosErr.response?.data?.message ?? 'Error al subir el archivo.'));
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRenombrar = async (doc: DocFile) => {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Renombrar archivo',
      input: 'text',
      inputLabel: 'Nuevo nombre',
      inputValue: doc.nombreOriginal,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'El nombre no puede estar vacío.' : null),
    });
    if (!isConfirmed || !value?.trim()) return;
    try {
      await api.patch(`/docs-personales/${doc._id}/renombrar`, { nombreOriginal: value.trim() });
      onUploaded();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: unknown } } };
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: toError(axiosErr.response?.data?.message ?? 'No se pudo renombrar.'),
      });
    }
  };

  const handleEliminar = async (doc: DocFile) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar archivo?',
      text: `Se eliminará "${doc.nombreOriginal}". Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`/docs-personales/${doc._id}`);
      onUploaded();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: unknown } } };
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: toError(axiosErr.response?.data?.message ?? 'No se pudo eliminar.'),
      });
    }
  };

  return (
    <Card className="card-enmv card-enmv-top-azul card-riveted h-100">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <span className="me-2 fs-5">{info.icon}</span>
            <strong>{info.label}</strong>
          </div>
          <span className={`badge badge-pill-enmv ${info.cantidad > 0 ? 'badge-estado-aprobado' : 'bg-secondary text-white'}`}>
            {info.cantidad} archivo{info.cantidad !== 1 ? 's' : ''}
          </span>
        </div>

        {err && (
          <Alert variant="danger" className="py-2 small" onClose={() => setErr('')} dismissible>
            {err}
          </Alert>
        )}

        {/* Lista de archivos */}
        {info.archivos.length > 0 && (
          <div className="mb-3">
            {info.archivos.map((doc) => (
              <div
                key={doc._id}
                className="border rounded px-3 py-2 mb-2 bg-light small"
              >
                <div className="text-truncate">
                  <div className="fw-semibold text-truncate">{doc.nombreOriginal}</div>
                  <div className="text-muted">
                    {formatSize(doc.tamanio)} · {formatDate(doc.subidasEn)}
                  </div>
                </div>
                {doc.storageType === 'local' && (
                  <div className="text-warning small mt-1">
                    ⚠️ Este archivo es de una versión anterior del sistema y ya no está disponible. Vuelve a subirlo.
                  </div>
                )}
                <div className="d-flex gap-2 flex-wrap mt-2">
                  {doc.urlDescargar && (
                    <Button
                      size="sm"
                      variant="outline-primary"
                      href={doc.urlDescargar}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ↓ Descargar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => void handleRenombrar(doc)}
                  >
                    ✏️ Renombrar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => void handleEliminar(doc)}
                  >
                    ✕ Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload */}
        {uploading ? (
          <div>
            <div className="small text-muted mb-1">Subiendo… {progress}%</div>
            <div className="progress" style={{ height: 6 }}>
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="d-none"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => inputRef.current?.click()}
            >
              + Subir archivo
            </Button>
            <div className="text-muted small mt-1">PDF, JPG o PNG</div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MisDocsPersonalesPage() {
  const [data, setData] = useState<MisDocsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<MisDocsResponse>('/docs-personales/mis-docs');
      setData(res.data);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: unknown } } };
      setError(toError(axiosErr.response?.data?.message ?? 'Error al cargar documentos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => { await cargar(); };
    init();
  }, [cargar]);

  if (loading) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante d-flex align-items-center justify-content-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  const tiposReqConArchivos = (data?.tipos ?? []).filter(
    (t) => t.tipo !== 'visa' && t.cantidad > 0,
  ).length;

  return (
    <div className="py-4 nautical-panel nautical-panel-postulante" style={{ minHeight: '100vh' }}>
      <Container>
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>
        <Row className="align-items-end mb-4 g-3">
          <Col>
            <span className="badge badge-pill-enmv badge-estado-proceso mb-2">Documentos</span>
            <h1 className="section-title">
              <i className="bi bi-life-preserver nautical-icon" />
              Documentos personales
            </h1>
            <p className="text-muted mb-0">
              Sube tus documentos de identidad. Puedes subir varios archivos por tipo (PDF, JPG o PNG).
            </p>
          </Col>
          {data && (
            <Col xs="auto">
              <span
                className={`badge badge-pill-enmv ${tiposReqConArchivos === TIPOS_DOC_REQUERIDOS.length ? 'badge-estado-aprobado' : 'badge-estado-proceso'}`}
                style={{ fontSize: '0.9rem', padding: '0.4em 1em' }}
              >
                {tiposReqConArchivos} / {TIPOS_DOC_REQUERIDOS.length} tipos entregados
              </span>
            </Col>
          )}
        </Row>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="horizonte-divider" />

        <Row className="g-3">
          {TIPOS_DOC_IDENTIDAD.map(({ tipo, icon }) => {
            const resumen = data?.tipos.find((t) => t.tipo === tipo) ?? {
              tipo,
              label: TIPOS_DOC.find((t) => t.tipo === tipo)!.label,
              cantidad: 0,
              archivos: [],
            };
            return (
              <Col key={tipo} xs={12} sm={6} lg={3}>
                <TarjetaTipo
                  info={{ ...resumen, icon }}
                  onUploaded={cargar}
                />
              </Col>
            );
          })}
        </Row>

        <h2 className="section-title mt-5">
          <i className="bi bi-award nautical-icon" />
          Constancias de capacitación y certificaciones marítimas
        </h2>
        <div className="horizonte-divider" />

        <Row className="g-3">
          {TIPOS_DOC_MARITIMOS.map(({ tipo, icon }) => {
            const resumen = data?.tipos.find((t) => t.tipo === tipo) ?? {
              tipo,
              label: TIPOS_DOC.find((t) => t.tipo === tipo)!.label,
              cantidad: 0,
              archivos: [],
            };
            return (
              <Col key={tipo} xs={12} sm={6} lg={3}>
                <TarjetaTipo
                  info={{ ...resumen, icon }}
                  onUploaded={cargar}
                />
              </Col>
            );
          })}
        </Row>
      </Container>
    </div>
  );
}
