'use client';

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Dropdown,
  DropdownButton,
  Form,
  ProgressBar,
  Row,
  Table,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { IconAncla, IconBarco, IconTimon, SpinnerTimon } from '@/components/ui/NauticalIcons';
import { PortholeAvatar } from '@/components/ui/PortholeAvatar';
import { ComentarioCard } from '@/components/ComentarioCard';
import { TiempoTotalCard } from '@/components/bitacora-embarque/TiempoTotalCard';
import { EmbarqueTimeline } from '@/components/bitacora-embarque/EmbarqueTimeline';
import type { BitacoraEmbarqueResponse } from '@/components/bitacora-embarque/types';

type Estado = 'en_proceso' | 'completado' | 'rechazado';

type TipoDocPersonal =
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

const TIPOS_DOC_PERSONAL: { tipo: TipoDocPersonal; label: string }[] = [
  { tipo: 'CURP',                      label: 'CURP' },
  { tipo: 'INE',                       label: 'INE' },
  { tipo: 'acta_nacimiento',           label: 'Acta de nacimiento' },
  { tipo: 'visa',                      label: 'Visa' },
  { tipo: 'pasaporte',                 label: 'Pasaporte' },
  { tipo: 'vacuna_fiebre_amarilla',    label: 'Vacuna de fiebre amarilla' },
  { tipo: 'constancia_participacion',  label: 'Constancia de participación' },
  { tipo: 'certificado_medico',        label: 'Certificado médico' },
  { tipo: 'libreta_identidad_maritima',label: 'Libreta de identidad marítima' },
  { tipo: 'certificado_competencia',   label: 'Certificado de competencia' },
];

const TIPOS_DOC_PERSONAL_REQUERIDOS = TIPOS_DOC_PERSONAL.filter((t) => t.tipo !== 'visa');

interface DocPersonalFile {
  _id: string;
  nombreOriginal: string;
  tamanio: number;
  tipoMime: string;
  subidasEn: string;
  urlDescargar?: string;
  storageType?: 'local' | 'cloudinary';
}

interface DocsPersonalesResumen {
  tipos: { tipo: TipoDocPersonal; label: string; cantidad: number; archivos: DocPersonalFile[] }[];
  totalArchivos: number;
  tiposConArchivos: number;
}

interface CandidatoDetalle {
  postulanteId: string;
  usuarioId: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  ciudad?: string;
  pais?: string;
  linkedinUrl?: string;
  vacante?: string;
  estadoPostulacion: Estado;
  docsEvaluados: number;
  docsTotal: number;
  estadoEvaluacion: 'pendiente' | 'en_evaluacion' | 'evaluado';
  cvActual?: {
    id: string;
    nombreOriginal: string;
    tamanio: number;
    version: number;
    subidasEn: string;
    urlDescargar?: string;
    storageType?: 'local' | 'cloudinary';
  } | null;
}

type ResultadoEvaluacion = 'APROBADO' | 'RECHAZADO' | 'EN_REVISION';

interface Comentario {
  id: string;
  documentoClave: string;
  comentario: string;
  calificacion?: number;
  estadoSugerido: Estado;
  resultadoEvaluacion?: ResultadoEvaluacion;
  fechaEvaluacion?: string;
  evaluadorId: string;
  evaluadorNombre: string;
  creadoEn: string;
}

interface EvaluacionDocumento {
  documentoClave: string;
  label: string;
  ultimaEvaluacion: Comentario | null;
  historial: Comentario[];
}

const resultadoLabel: Record<ResultadoEvaluacion, string> = {
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  EN_REVISION: 'En revisión',
};

const resultadoColor: Record<ResultadoEvaluacion, string> = {
  APROBADO: 'success',
  RECHAZADO: 'danger',
  EN_REVISION: 'warning',
};

interface CursoItem {
  _id: string;
  nombreCurso: string;
  institucion?: string;
  fechaCurso: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  apareceEnCV: boolean;
  tieneDocumentoExtra: boolean;
  documentoExtra?: {
    nombreOriginal: string;
    tamanio: number;
    tipoMime: string;
    urlDescargar?: string;
    storageType?: 'local' | 'cloudinary';
  };
}

interface CursosResponse {
  postulante: {
    id: string;
    nombreCompleto: string;
    email: string;
  };
  cursos: CursoItem[];
  total: number;
}

interface DatosCV {
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null;
  telefono?: string | null;
  resumen?: string | null;
  estudios?: Array<{ institucion?: string; grado?: string; area?: string | null; inicio?: string | null; fin?: string | null }>;
  experienciaLaboral?: Array<{ empresa?: string; puesto?: string; inicio?: string | null; fin?: string | null; descripcion?: string | null }>;
  cursos?: Array<{ nombre?: string; institucion?: string | null; fechaInicio?: string | null; fechaVencimiento?: string | null }>;
  habilidades?: string[];
  idiomas?: Array<{ idioma?: string; nivel?: string | null }>;
}

type EstadoExtraccion = 'propuesto' | 'confirmado' | 'rechazado';

interface Extraccion {
  _id: string;
  estado: EstadoExtraccion;
  datosExtraidos?: DatosCV;
  datosConfirmados?: DatosCV;
  modeloUsado?: string;
  errorMensaje?: string;
  confirmadoEn?: string;
  creadoEn: string;
}

const estadoLabel: Record<Estado, string> = {
  en_proceso: 'En proceso',
  completado: 'Completado',
  rechazado: 'Rechazado',
};

const estadoIconClass: Record<Estado, string> = {
  en_proceso: 'bi-clock',
  completado: 'bi-check-lg',
  rechazado: 'bi-x-lg',
};

const estadoColor: Record<Estado, string> = {
  en_proceso: 'warning',
  completado: 'success',
  rechazado: 'danger',
};

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg) {
    return toErrorMessage((msg as { message?: unknown }).message);
  }
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

const formatDate = (date: string) =>
  new Date(date).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDateOnly = (date: string) =>
  new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Panel de evaluación de un documento puntual del expediente. Nunca se
 * deshabilita: siempre se puede evaluar o re-evaluar, sin importar si ya
 * hay una evaluación previa (propia o de otro evaluador).
 */
function EvaluacionDocumentoPanel({
  evaluacion,
  saving,
  onEvaluar,
}: {
  evaluacion: EvaluacionDocumento;
  saving: boolean;
  onEvaluar: (
    documentoClave: string,
    payload: { resultadoEvaluacion: ResultadoEvaluacion; comentario: string },
  ) => Promise<void>;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEvaluacion>('EN_REVISION');
  const [comentario, setComentario] = useState('');

  const ultima = evaluacion.ultimaEvaluacion;

  const handleSubmit = async () => {
    await onEvaluar(evaluacion.documentoClave, { resultadoEvaluacion: resultado, comentario });
    setComentario('');
    setMostrarForm(false);
  };

  return (
    <div className="border rounded px-3 py-2 mt-2" style={{ background: '#fbfbfb' }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          {ultima ? (
            <>
              <Badge bg={resultadoColor[ultima.resultadoEvaluacion ?? 'EN_REVISION']} className="badge-pill-enmv me-2">
                {resultadoLabel[ultima.resultadoEvaluacion ?? 'EN_REVISION']}
              </Badge>
              <span className="small text-muted">
                {ultima.evaluadorNombre} · {formatDate(ultima.fechaEvaluacion ?? ultima.creadoEn)}
              </span>
              {ultima.comentario && <div className="small text-muted mt-1">{ultima.comentario}</div>}
            </>
          ) : (
            <span className="small text-muted">Sin evaluar</span>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          {evaluacion.historial.length > 0 && (
            <Button size="sm" variant="link" className="p-0" onClick={() => setMostrarHistorial((v) => !v)}>
              Historial ({evaluacion.historial.length})
            </Button>
          )}
          <Button
            size="sm"
            variant={ultima ? 'outline-secondary' : 'outline-primary'}
            onClick={() => setMostrarForm((v) => !v)}
          >
            {ultima ? 'Re-evaluar' : 'Evaluar'}
          </Button>
        </div>
      </div>

      {mostrarHistorial && evaluacion.historial.length > 0 && (
        <div className="mt-2 d-flex flex-column gap-2">
          {evaluacion.historial.map((h) => (
            <div key={h.id} className="small border-top pt-1">
              <Badge bg={resultadoColor[h.resultadoEvaluacion ?? 'EN_REVISION']} className="badge-pill-enmv me-2">
                {resultadoLabel[h.resultadoEvaluacion ?? 'EN_REVISION']}
              </Badge>
              {h.evaluadorNombre} · {formatDate(h.fechaEvaluacion ?? h.creadoEn)}
              {h.comentario && <div className="text-muted">{h.comentario}</div>}
            </div>
          ))}
        </div>
      )}

      {mostrarForm && (
        <div className="mt-2 pt-2 border-top">
          <Form.Select
            size="sm"
            className="mb-2"
            value={resultado}
            onChange={(e) => setResultado(e.target.value as ResultadoEvaluacion)}
          >
            <option value="APROBADO">Aprobado</option>
            <option value="RECHAZADO">Rechazado</option>
            <option value="EN_REVISION">En revisión</option>
          </Form.Select>
          <Form.Control
            as="textarea"
            rows={2}
            className="mb-2"
            maxLength={1000}
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando...' : ultima ? 'Confirmar re-evaluación' : 'Confirmar evaluación'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CandidatoDetallePage() {
  const params = useParams<{ id: string }>();
  const candidatoId = useMemo(() => String(params?.id ?? ''), [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<CandidatoDetalle | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [evaluacionesPorDocumento, setEvaluacionesPorDocumento] = useState<EvaluacionDocumento[]>([]);
  const [mostrarHistorialComentarios, setMostrarHistorialComentarios] = useState(false);
  const [cursosData, setCursosData] = useState<CursosResponse | null>(null);
  const [docsPersonales, setDocsPersonales] = useState<DocsPersonalesResumen | null>(null);
  const [bitacoraData, setBitacoraData] = useState<BitacoraEmbarqueResponse | null>(null);

  const [savingDocumento, setSavingDocumento] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState(false);

  // ── IA ──────────────────────────────────────────────────────────────────────
  const [extraccion, setExtraccion] = useState<Extraccion | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaProcesando, setIaProcesando] = useState(false);
  const [iaError, setIaError] = useState('');
  const [editandoIA, setEditandoIA] = useState(false);
  const [datosBorrador, setDatosBorrador] = useState<DatosCV>({});

  const cargarExtraccion = useCallback(async () => {
    if (!candidatoId) return;
    try {
      setIaLoading(true);
      setIaError('');
      const res = await api.get<Extraccion | null>(`/ingest-ia/${candidatoId}`);
      setExtraccion(res.data ?? null);
    } catch {
      setExtraccion(null);
    } finally {
      setIaLoading(false);
    }
  }, [candidatoId]);

  const iniciarExtraccion = async () => {
    try {
      setIaProcesando(true);
      setIaError('');
      await api.post(`/ingest-ia/procesar/${candidatoId}`);
      // Polling: la extracción es asíncrona, esperamos ~4s y recargamos
      await new Promise((r) => setTimeout(r, 4000));
      await cargarExtraccion();
      if (extraccion?.estado === 'propuesto' && !extraccion.datosExtraidos) {
        // Puede que aún esté procesando; se refresca manualmente
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setIaError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setIaProcesando(false);
    }
  };

  const confirmarExtraccion = async () => {
    if (!extraccion) return;
    try {
      setIaProcesando(true);
      setIaError('');
      const res = await api.patch<Extraccion>(
        `/ingest-ia/${extraccion._id}/confirmar`,
        { datosConfirmados: editandoIA ? datosBorrador : extraccion.datosExtraidos },
      );
      setExtraccion(res.data);
      setEditandoIA(false);
      await Swal.fire({ icon: 'success', title: 'Datos confirmados', text: 'La extracción quedó validada.', timer: 2000, showConfirmButton: false });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setIaError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setIaProcesando(false);
    }
  };

  const rechazarExtraccion = async () => {
    if (!extraccion) return;
    const conf = await Swal.fire({
      icon: 'warning', title: '¿Rechazar extracción?',
      text: 'Se descartarán los datos propuestos por la IA.',
      showCancelButton: true, confirmButtonText: 'Sí, rechazar', cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    try {
      setIaProcesando(true);
      const res = await api.patch<Extraccion>(`/ingest-ia/${extraccion._id}/rechazar`);
      setExtraccion(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setIaError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setIaProcesando(false);
    }
  };

  const cargarTodo = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const detalleRes = await api.get<CandidatoDetalle>(
        `/evaluaciones/candidatos/${candidatoId}`,
      );
      setDetalle(detalleRes.data);

      try {
        const comentariosRes = await api.get<Comentario[]>(
          `/evaluaciones/${candidatoId}/comentarios`,
        );
        setComentarios(comentariosRes.data ?? []);
      } catch (err) {
        console.error('[candidato/[id]] fallo /comentarios', err);
        setComentarios([]);
      }

      try {
        const documentosRes = await api.get<EvaluacionDocumento[]>(
          `/evaluaciones/${candidatoId}/documentos`,
        );
        setEvaluacionesPorDocumento(documentosRes.data ?? []);
      } catch (err) {
        console.error('[candidato/[id]] fallo /documentos', err);
        setEvaluacionesPorDocumento([]);
      }

      try {
        const cursosRes = await api.get<CursosResponse>(
          `/cursos/postulante/${candidatoId}`,
        );
        setCursosData(cursosRes.data);
      } catch {
        setCursosData(null);
      }

      try {
        const docsRes = await api.get<DocsPersonalesResumen>(
          `/docs-personales/postulante/${candidatoId}`,
        );
        setDocsPersonales(docsRes.data);
      } catch {
        setDocsPersonales(null);
      }

      try {
        const bitacoraRes = await api.get<BitacoraEmbarqueResponse>(
          `/bitacora-embarque/postulante/${candidatoId}`,
        );
        setBitacoraData(bitacoraRes.data);
      } catch {
        setBitacoraData(null);
      }
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: unknown } };
        message?: string;
      };
      console.error(
        '[candidato/[id]] fallo /evaluaciones/candidatos/:id — status:',
        axiosErr.response?.status,
        'data:',
        axiosErr.response?.data,
      );
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setLoading(false);
    }
  }, [candidatoId]);

  useEffect(() => {
    if (!loading && window.location.hash) {
      document
        .querySelector(window.location.hash)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  useEffect(() => {
    if (candidatoId) {
      const init = async () => {
        await cargarTodo();
        await cargarExtraccion();
      };
      init();
    }
  }, [candidatoId, cargarExtraccion, cargarTodo]);

  const evaluarDocumento = async (
    documentoClave: string,
    payload: { resultadoEvaluacion: ResultadoEvaluacion; comentario: string },
  ) => {
    try {
      setSavingDocumento(documentoClave);
      setError('');
      await api.post(`/evaluaciones/${candidatoId}/comentarios`, {
        documentoClave,
        resultadoEvaluacion: payload.resultadoEvaluacion,
        comentario: payload.comentario.trim() || undefined,
      });
      await cargarTodo();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setSavingDocumento(null);
    }
  };

  const decidirCandidato = async (decision: Estado) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Confirmar decisión final?',
      text: `El candidato pasará a estado "${estadoLabel[decision]}" y se le notificará por correo. Esta acción se puede repetir después si cambia de opinión.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, confirmar',
      cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;

    try {
      setDecidiendo(true);
      setError('');
      await api.post(`/evaluaciones/${candidatoId}/decision`, { decision });
      await Swal.fire({
        icon: 'success',
        title: 'Decisión registrada',
        timer: 1800,
        showConfirmButton: false,
      });
      await cargarTodo();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setDecidiendo(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const exportarExpediente = async (formato: 'docx' | 'pdf') => {
    if (!detalle) return;
    try {
      const res = await api.get<Blob>(
        `/candidatos/${detalle.postulanteId}/expediente`,
        { params: { formato }, responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      const nombreNorm = `${detalle.nombre}-${detalle.apellidos}`.replace(/\s+/g, '-');
      const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.setAttribute('download', `Expediente_${nombreNorm}_${fechaHoy}.${formato}`);
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo generar el archivo. Inténtalo de nuevo.',
      });
    }
  };

  if (loading) {
    return (
      <Container fluid className="nautical-panel d-flex justify-content-center align-items-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  if (!detalle) {
    return (
      <Container className="py-4">
        <Alert variant="danger">No se encontro el candidato solicitado.</Alert>
        <Link href="/candidatos" className="btn btn-outline-secondary">
          Volver a candidatos
        </Link>
      </Container>
    );
  }

  const docsPersonalesReqConArchivos = (docsPersonales?.tipos ?? []).filter(
    (t) => t.tipo !== 'visa' && t.cantidad > 0,
  ).length;

  const evalPorClave = new Map(
    evaluacionesPorDocumento.map((e) => [e.documentoClave, e]),
  );

  return (
    <div className="nautical-panel min-vh-100 py-4">
      <Container fluid>
        <Row className="mb-3">
          <Col className="d-flex gap-2 flex-wrap">
            <Link href="/candidatos" className="btn btn-outline-secondary btn-sm">
              Volver
            </Link>
            {detalle?.postulanteId && (
              <Link
                href={`/archivos/${detalle.postulanteId}`}
                className="btn btn-outline-primary btn-sm"
              >
                Archivos del evaluador
              </Link>
            )}
            <DropdownButton
              variant="outline-primary"
              size="sm"
              title="Generar Expediente"
              id="btn-generar-expediente"
            >
              <Dropdown.Item onClick={() => exportarExpediente('docx')}>
                Word (.docx)
              </Dropdown.Item>
              <Dropdown.Item onClick={() => exportarExpediente('pdf')}>
                PDF (.pdf)
              </Dropdown.Item>
            </DropdownButton>
          </Col>
        </Row>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="horizonte-divider" />

        <Row className="g-4">
          <Col lg={6}>
            <Card className="card-enmv card-enmv-top-azul mb-4">
              <Card.Body>
                <h5 className="section-title mb-3">
                  <IconAncla size={17} className="nautical-icon" />
                  Informacion del candidato
                  <span className="anchor-glyph">⚓</span>
                </h5>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <PortholeAvatar nombre={`${detalle.nombre} ${detalle.apellidos}`} size={52} />
                  <div>
                    <p className="mb-0"><strong>{detalle.nombre} {detalle.apellidos}</strong></p>
                    <p className="mb-0 text-muted small">{detalle.email}</p>
                  </div>
                </div>
                <p className="mb-1 text-muted">
                  {[detalle.ciudad, detalle.pais].filter(Boolean).join(', ') || '-'}
                </p>
                <p className="mb-0">
                  Estado actual:{' '}
                  <Badge bg={estadoColor[detalle.estadoPostulacion]} className="badge-pill-enmv">
                    <i className={`bi ${estadoIconClass[detalle.estadoPostulacion]}`} />
                    {estadoLabel[detalle.estadoPostulacion]}
                  </Badge>
                </p>
                <p className="mb-0 mt-2">Vacante: {detalle.vacante || <span className="text-muted">Sin definir</span>}</p>
                {evalPorClave.get('vacante') && (
                  <EvaluacionDocumentoPanel
                    evaluacion={evalPorClave.get('vacante')!}
                    saving={savingDocumento === 'vacante'}
                    onEvaluar={evaluarDocumento}
                  />
                )}
              </Card.Body>
            </Card>

            <Card className="card-enmv card-enmv-top-verde">
              <Card.Body>
                <h5 className="section-title mb-3">
                  CV actual
                  <span className="anchor-glyph">⚓</span>
                </h5>
                {detalle.cvActual ? (
                  <div className="d-flex align-items-center justify-content-between gap-3 border rounded px-3 py-2 bg-light">
                    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                      <i className="bi bi-file-earmark-text flex-shrink-0" style={{ fontSize: '1.3rem', color: 'var(--enmv-verde)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="text-truncate" style={{ maxWidth: 320 }} title={detalle.cvActual.nombreOriginal}>
                          <strong>{detalle.cvActual.nombreOriginal}</strong>
                        </div>
                        <div className="text-muted small">
                          Version {detalle.cvActual.version} · {formatDate(detalle.cvActual.subidasEn)}
                        </div>
                      </div>
                    </div>
                    {detalle.cvActual.urlDescargar ? (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => window.open(detalle.cvActual?.urlDescargar, '_blank')}
                      >
                        <i className="bi bi-download me-1" />
                        Descargar CV
                      </Button>
                    ) : (
                      <span className="text-warning small flex-shrink-0">
                        ⚠️ Versión anterior no disponible
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <IconAncla size={16} />
                    <span>Este candidato aun no tiene CV cargado.</span>
                  </div>
                )}
                {evalPorClave.get('cv') && (
                  <EvaluacionDocumentoPanel
                    evaluacion={evalPorClave.get('cv')!}
                    saving={savingDocumento === 'cv'}
                    onEvaluar={evaluarDocumento}
                  />
                )}
              </Card.Body>
            </Card>

            <Card className="card-enmv card-enmv-top-azul mt-4">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="section-title mb-0">
                    <i className="bi bi-life-preserver nautical-icon" />
                    Documentos personales
                    <span className="anchor-glyph">⚓</span>
                  </h5>
                  {docsPersonales && (
                    <Badge
                      bg={docsPersonalesReqConArchivos === TIPOS_DOC_PERSONAL_REQUERIDOS.length ? 'success' : 'warning'}
                      text={docsPersonalesReqConArchivos === TIPOS_DOC_PERSONAL_REQUERIDOS.length ? undefined : 'dark'}
                      className="badge-pill-enmv"
                    >
                      {docsPersonalesReqConArchivos === TIPOS_DOC_PERSONAL_REQUERIDOS.length && (
                        <i className="bi bi-check-lg" />
                      )}
                      {docsPersonalesReqConArchivos}/{TIPOS_DOC_PERSONAL_REQUERIDOS.length} tipos entregados
                    </Badge>
                  )}
                </div>
                {!docsPersonales ? (
                  <div className="empty-state">
                    <i className="bi bi-life-preserver" />
                    <span>Sin información de documentos personales.</span>
                  </div>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {TIPOS_DOC_PERSONAL.map(({ tipo, label }) => {
                      const resumen = docsPersonales.tipos.find((t) => t.tipo === tipo);
                      const cantidad = resumen?.cantidad ?? 0;
                      return (
                        <li key={tipo} className="mb-2">
                          <div className="d-flex justify-content-between align-items-start">
                            <span>
                              <span className="me-2">{cantidad > 0 ? '✅' : tipo === 'visa' ? '⭕' : '❌'}</span>
                              <strong>{label}</strong>
                              {cantidad === 0 && (
                                <span className="text-muted small ms-2">
                                  {tipo === 'visa' ? 'Opcional' : 'Faltante'}
                                </span>
                              )}
                            </span>
                            {cantidad > 0 || tipo === 'visa' ? (
                              <span className="text-muted small">{cantidad} archivo{cantidad !== 1 ? 's' : ''}</span>
                            ) : (
                              <span className="badge badge-pill-enmv badge-estado-rechazado">
                                <i className="bi bi-exclamation-triangle" />
                                Pendiente por subir
                              </span>
                            )}
                          </div>
                          {resumen && resumen.archivos.length > 0 && (
                            <div className="d-flex flex-column gap-2 mt-2">
                              {resumen.archivos.map((f) => (
                                <div
                                  key={f._id}
                                  className="d-flex align-items-center justify-content-between gap-3 border rounded px-3 py-2 bg-light"
                                >
                                  <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                                    <i className="bi bi-file-earmark-text text-muted flex-shrink-0" style={{ fontSize: '1.1rem' }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div className="small text-truncate" style={{ maxWidth: 280 }} title={f.nombreOriginal}>
                                        {f.nombreOriginal}
                                      </div>
                                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                        {formatFileSize(f.tamanio)} · {formatDate(f.subidasEn)}
                                      </div>
                                    </div>
                                  </div>
                                  {f.urlDescargar ? (
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      href={f.urlDescargar}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex-shrink-0"
                                    >
                                      <i className="bi bi-download me-1" />
                                      Descargar
                                    </Button>
                                  ) : (
                                    <span className="text-warning small flex-shrink-0">
                                      ⚠️ Vuelve a subirlo
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {tipo !== 'visa' && evalPorClave.get(tipo) && (
                            <EvaluacionDocumentoPanel
                              evaluacion={evalPorClave.get(tipo)!}
                              saving={savingDocumento === tipo}
                              onEvaluar={evaluarDocumento}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card.Body>
            </Card>

            <Card id="cursos-y-certificaciones" className="card-enmv card-enmv-top-dorado mt-4">
              <Card.Body>
                <h5 className="section-title mb-3">
                  <IconTimon size={17} className="nautical-icon" />
                  Cursos y certificaciones
                  <span className="anchor-glyph">⚓</span>
                </h5>

                {!cursosData || cursosData.total === 0 ? (
                  <div className="empty-state">
                    <IconTimon size={16} />
                    <span>No hay cursos/certificaciones registrados.</span>
                  </div>
                ) : (
                  <Table size="sm" responsive hover className="mb-0">
                    <thead>
                      <tr>
                        <th>Curso</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Fecha inicio</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Fecha vencimiento</th>
                        <th>Documento</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cursosData.cursos.map((curso) => {
                        const vencido =
                          curso.fechaVencimiento &&
                          new Date(curso.fechaVencimiento) < new Date();
                        return (
                          <tr key={curso._id}>
                            <td>
                              <div className="fw-semibold">{curso.nombreCurso}</div>
                              {curso.institucion && (
                                <div className="small text-muted">{curso.institucion}</div>
                              )}
                            </td>
                            <td className="small" style={{ whiteSpace: 'nowrap' }}>
                              {curso.fechaInicio
                                ? formatDateOnly(curso.fechaInicio)
                                : <span className="text-muted">—</span>}
                            </td>
                            <td className="small" style={{ whiteSpace: 'nowrap' }}>
                              {curso.fechaVencimiento ? (
                                <span style={{ color: vencido ? '#dc3545' : undefined }}>
                                  {formatDateOnly(curso.fechaVencimiento)}
                                  {vencido && (
                                    <Badge bg="danger" className="ms-1 badge-pill-enmv" style={{ fontSize: '0.6rem' }}>
                                      Vencido
                                    </Badge>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted">Sin vencimiento</span>
                              )}
                            </td>
                            <td className="small">
                              {curso.documentoExtra?.urlDescargar ? (
                                <a href={curso.documentoExtra.urlDescargar} target="_blank" rel="noreferrer"
                                  title={curso.documentoExtra.nombreOriginal}>
                                  📥 {formatFileSize(curso.documentoExtra.tamanio)}
                                </a>
                              ) : curso.documentoExtra ? (
                                <span className="text-warning" title="Archivo de una versión anterior; vuelve a subirlo.">
                                  ⚠️ Vuelve a subirlo
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td>
                              {curso.documentoExtra?.urlDescargar && (
                                <a
                                  href={curso.documentoExtra.urlDescargar}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-outline-secondary btn-sm"
                                  title="Ver certificado"
                                >
                                  Ver
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </Card.Body>
            </Card>

            <Card id="bitacora-de-embarque" className="card-enmv card-enmv-top-dorado mt-4">
              <Card.Body>
                <h5 className="section-title mb-3">
                  <IconBarco size={17} className="nautical-icon" />
                  Bitácora de Embarque
                  <span className="anchor-glyph">⚓</span>
                </h5>

                {!bitacoraData || bitacoraData.total === 0 ? (
                  <div className="empty-state">
                    <IconBarco size={16} />
                    <span>El candidato no ha registrado embarques.</span>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <TiempoTotalCard tiempoTotal={bitacoraData.tiempoTotal} />
                    </div>
                    <EmbarqueTimeline embarques={bitacoraData.embarques} />
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={6}>
            <Card className="card-enmv card-enmv-top-verde mb-4">
              <Card.Body>
                <h5 className="section-title mb-3">
                  <i className="bi bi-compass nautical-icon" />
                  Decisión final del candidato
                  <span className="anchor-glyph">⚓</span>
                </h5>
                <p className="small text-muted">
                  Independiente de las evaluaciones por documento. Notifica al postulante por correo y se puede
                  volver a cambiar más adelante.
                </p>
                <p className="mb-3">
                  Estado actual:{' '}
                  <Badge bg={estadoColor[detalle.estadoPostulacion]} className="badge-pill-enmv">
                    <i className={`bi ${estadoIconClass[detalle.estadoPostulacion]}`} />
                    {estadoLabel[detalle.estadoPostulacion]}
                  </Badge>
                </p>
                <div className="d-flex gap-2 flex-wrap">
                  <Button variant="success" size="sm" disabled={decidiendo} onClick={() => decidirCandidato('completado')}>
                    <i className="bi bi-check-lg me-1" />
                    Aprobar candidato
                  </Button>
                  <Button variant="danger" size="sm" disabled={decidiendo} onClick={() => decidirCandidato('rechazado')}>
                    <i className="bi bi-x-lg me-1" />
                    Rechazar candidato
                  </Button>
                  <Button variant="outline-secondary" size="sm" disabled={decidiendo} onClick={() => decidirCandidato('en_proceso')}>
                    <i className="bi bi-clock me-1" />
                    Marcar en proceso
                  </Button>
                </div>
              </Card.Body>
            </Card>

            <Card className="card-enmv card-enmv-top-azul">
              <Card.Body>
                <h5 className="section-title mb-3">
                  Historial de comentarios
                  <span className="anchor-glyph">⚓</span>
                </h5>
                {comentarios.length === 0 ? (
                  <div className="empty-state">
                    <i className="bi bi-chat-left-text" />
                    <span>Aun no hay comentarios registrados.</span>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    <ComentarioCard
                      item={{
                        ...comentarios[0],
                        documentoLabel:
                          evalPorClave.get(comentarios[0].documentoClave)?.label ??
                          (comentarios[0].documentoClave === 'general' ? 'Evaluación general (legado)' : comentarios[0].documentoClave),
                      }}
                    />

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
                              <ComentarioCard
                                key={item.id}
                                item={{
                                  ...item,
                                  documentoLabel:
                                    evalPorClave.get(item.documentoClave)?.label ??
                                    (item.documentoClave === 'general' ? 'Evaluación general (legado)' : item.documentoClave),
                                }}
                              />
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

        <div className="horizonte-divider" />

        {/* ── Panel Extracción IA ──────────────────────────────────────────── */}
        <Row className="mt-4">
          <Col>
            <Card className="card-enmv card-enmv-top-dorado">
              <Card.Body className="p-4">
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                  <div>
                    <h5 className="section-title mb-0">
                      Extracción de datos con IA
                      {extraccion && (
                        <Badge
                          bg={extraccion.estado === 'confirmado' ? 'success' : extraccion.estado === 'rechazado' ? 'danger' : 'warning'}
                          text={extraccion.estado === 'propuesto' ? 'dark' : undefined}
                          className="ms-2 badge-pill-enmv"
                        >
                          <i className={`bi ${extraccion.estado === 'confirmado' ? 'bi-check-lg' : extraccion.estado === 'rechazado' ? 'bi-x-lg' : 'bi-clock'}`} />
                          {extraccion.estado === 'confirmado' ? 'Confirmado' : extraccion.estado === 'rechazado' ? 'Rechazado' : 'Propuesto — pendiente de revisión'}
                        </Badge>
                      )}
                      <span className="anchor-glyph">⚓</span>
                    </h5>
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    {(!extraccion || extraccion.estado === 'rechazado') && (
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={iaProcesando || !detalle?.cvActual}
                        onClick={() => void iniciarExtraccion()}
                        title={!detalle?.cvActual ? 'El postulante no tiene CV cargado' : ''}
                      >
                        {iaProcesando ? <><SpinnerTimon size={14} className="me-1" />Procesando…</> : 'Extraer datos con IA'}
                      </Button>
                    )}
                    {extraccion?.estado === 'propuesto' && extraccion.datosExtraidos && (
                      <>
                        <Button size="sm" variant="outline-secondary" onClick={() => { setEditandoIA(!editandoIA); setDatosBorrador(extraccion.datosExtraidos ?? {}); }}>
                          {editandoIA ? 'Cancelar edición' : 'Editar antes de confirmar'}
                        </Button>
                        <Button size="sm" variant="success" disabled={iaProcesando} onClick={() => void confirmarExtraccion()}>
                          {iaProcesando ? <SpinnerTimon size={14} /> : 'Confirmar datos'}
                        </Button>
                        <Button size="sm" variant="outline-danger" disabled={iaProcesando} onClick={() => void rechazarExtraccion()}>
                          Rechazar
                        </Button>
                      </>
                    )}
                    {extraccion?.estado === 'confirmado' && (
                      <Button size="sm" variant="outline-secondary" disabled={iaProcesando} onClick={() => void iniciarExtraccion()}>
                        Re-extraer
                      </Button>
                    )}
                    {extraccion && (
                      <Button size="sm" variant="outline-secondary" onClick={() => void cargarExtraccion()} disabled={iaLoading}>
                        {iaLoading ? <SpinnerTimon size={14} /> : '↻ Refrescar'}
                      </Button>
                    )}
                  </div>
                </div>

                {iaError && <Alert variant="danger" className="mb-3">{iaError}</Alert>}

                {iaLoading && (
                  <div className="d-flex justify-content-center py-4"><SpinnerTimon size={36} /></div>
                )}

                {!iaLoading && !extraccion && (
                  <p className="text-muted mb-0">
                    La IA puede leer el CV del postulante y extraer automáticamente nombre, estudios, experiencia, cursos e idiomas.
                    Los datos se guardan como <strong>propuesta</strong> — tú los revisas, editas si hace falta, y confirmas.
                    {!detalle?.cvActual && <span className="d-block text-warning mt-1">⚠ El postulante aún no tiene CV cargado.</span>}
                  </p>
                )}

                {!iaLoading && extraccion?.estado === 'propuesto' && !extraccion.datosExtraidos && !extraccion.errorMensaje && (
                  <Alert variant="info" className="mb-3">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <SpinnerTimon size={28} />
                      <span>
                        La extracción está en proceso. Haz clic en <strong>↻ Refrescar</strong> en unos segundos para ver el resultado.
                      </span>
                    </div>
                    <ProgressBar animated striped now={100} className="mb-0" style={{ height: 6 }} />
                  </Alert>
                )}

                {!iaLoading && extraccion?.errorMensaje && (
                  <Alert variant="warning">
                    Error durante la extracción: {extraccion.errorMensaje}. Puedes intentarlo de nuevo.
                  </Alert>
                )}

                {!iaLoading && extraccion && (extraccion.datosExtraidos || extraccion.datosConfirmados) && (
                  <>
                    {editandoIA ? (
                      <ExtraccionFormEdicion datos={datosBorrador} onChange={setDatosBorrador} />
                    ) : (
                      <ExtraccionVistaLectura
                        datos={extraccion.estado === 'confirmado' ? (extraccion.datosConfirmados ?? extraccion.datosExtraidos ?? {}) : (extraccion.datosExtraidos ?? {})}
                        cursosReales={cursosData?.cursos ?? []}
                      />
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

type CursoUnificado = {
  nombre: string;
  institucion?: string | null;
  fechaInicio?: string | null;
  fechaVencimiento?: string | null;
  origen: 'ia' | 'postulante';
};

const quitarAcentos = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Traduce un nivel de idioma en texto libre (lo que devuelve la IA) a 0-4 puntos rellenos. */
function nivelIdiomaADots(nivel?: string | null): number {
  if (!nivel) return 0;
  const n = quitarAcentos(nivel);
  if (n.includes('nativ')) return 4;
  if (n.includes('avanzad') || n.includes('fluid') || /\bc[12]\b/.test(n)) return 3;
  if (n.includes('intermedi') || n.includes('medio') || /\bb[12]\b/.test(n)) return 2;
  if (n.includes('basic') || n.includes('principiante') || n.includes('elemental') || /\ba[12]\b/.test(n)) return 1;
  return 0;
}

function NivelDots({ nivel }: { nivel?: string | null }) {
  const dots = nivelIdiomaADots(nivel);
  return (
    <span className="d-inline-flex align-items-center gap-1" title={nivel ?? undefined}>
      {[1, 2, 3, 4].map((n) => (
        <i
          key={n}
          className={`bi ${n <= dots ? 'bi-circle-fill' : 'bi-circle'}`}
          style={{ fontSize: '0.5rem', color: n <= dots ? 'var(--enmv-dorado)' : 'rgba(10,34,64,.25)' }}
        />
      ))}
    </span>
  );
}

/** Ítem de línea de tiempo vertical: punto + línea conectora a la izquierda, contenido a la derecha. */
function LineaTiempoItem({ isLast, children }: { isLast: boolean; children: ReactNode }) {
  return (
    <div className="d-flex gap-3">
      <div className="d-flex flex-column align-items-center" style={{ width: 14, flexShrink: 0 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--enmv-azul)',
            border: '2px solid var(--enmv-dorado)',
            flexShrink: 0,
            marginTop: 3,
          }}
        />
        {!isLast && (
          <div className="flex-grow-1" style={{ width: 2, background: 'rgba(10,34,64,.15)', minHeight: 8 }} />
        )}
      </div>
      <div style={{ flex: 1 }} className={isLast ? 'pb-1' : 'pb-3'}>
        {children}
      </div>
    </div>
  );
}

function ExtraccionVistaLectura({
  datos,
  cursosReales,
}: {
  datos: DatosCV;
  cursosReales: CursoItem[];
}) {
  const cursosUnificados: CursoUnificado[] = [
    ...(datos.cursos ?? []).map((c) => ({
      nombre: c.nombre ?? '—',
      institucion: c.institucion,
      fechaInicio: c.fechaInicio,
      fechaVencimiento: c.fechaVencimiento,
      origen: 'ia' as const,
    })),
    ...cursosReales.map((c) => ({
      nombre: c.nombreCurso,
      institucion: c.institucion,
      fechaInicio: c.fechaInicio,
      fechaVencimiento: c.fechaVencimiento,
      origen: 'postulante' as const,
    })),
  ];

  return (
    <div className="row g-3">
      <div className="col-md-6">
        <strong className="small text-muted d-block mb-2">
          <i className="bi bi-person-vcard me-1" />
          Datos personales
        </strong>
        <div className="row g-2">
          {[
            { icon: 'bi-person', label: 'Nombre', value: [datos.nombre, datos.apellidos].filter(Boolean).join(' ') || null },
            { icon: 'bi-envelope', label: 'Email', value: datos.email },
            { icon: 'bi-telephone', label: 'Teléfono', value: datos.telefono },
          ].map((f) => (
            <div className="col-4" key={f.label}>
              <div className="border rounded p-2 h-100 bg-light text-center">
                <i className={`bi ${f.icon}`} style={{ fontSize: '1.1rem', color: 'var(--enmv-azul)' }} />
                <div
                  className="text-muted mt-1"
                  style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.03em' }}
                >
                  {f.label}
                </div>
                <div className="small fw-semibold text-truncate">{f.value ?? '—'}</div>
              </div>
            </div>
          ))}
        </div>
        {datos.resumen && (
          <div className="mt-3">
            <strong className="small text-muted d-block mb-2">
              <i className="bi bi-chat-quote me-1" />
              Resumen
            </strong>
            <div
              className="ps-3 py-2"
              style={{
                borderLeft: '4px solid var(--enmv-dorado)',
                background: 'rgba(201,162,75,.08)',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <p className="mb-0" style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{datos.resumen}</p>
            </div>
          </div>
        )}
      </div>

      <div className="col-md-6">
        <strong className="small text-muted d-block mb-2">
          <i className="bi bi-translate me-1" />
          Idiomas
        </strong>
        {datos.idiomas?.length ? (
          <div className="d-flex flex-column gap-1 mb-1">
            {datos.idiomas.map((i, idx) => (
              <div key={idx} className="d-flex align-items-center justify-content-between gap-2">
                <span className="small">{i.idioma}</span>
                <NivelDots nivel={i.nivel} />
              </div>
            ))}
          </div>
        ) : <span className="text-muted small">—</span>}
        <strong className="small text-muted d-block mb-2 mt-3">
          <i className="bi bi-stars me-1" />
          Habilidades
        </strong>
        {datos.habilidades?.length ? (
          <div className="d-flex flex-wrap gap-2">
            {datos.habilidades.map((h, idx) => (
              <Badge key={idx} bg="light" text="dark" className="border fw-normal">{h}</Badge>
            ))}
          </div>
        ) : <span className="text-muted small">—</span>}
      </div>

      {(datos.estudios?.length ?? 0) > 0 && (
        <div className="col-12">
          <strong className="small text-muted d-block mb-2">
            <i className="bi bi-mortarboard me-1" />
            Estudios
          </strong>
          <div>
            {datos.estudios!.map((e, idx) => (
              <LineaTiempoItem key={idx} isLast={idx === datos.estudios!.length - 1}>
                <div className="fw-semibold">{e.institucion ?? '—'}</div>
                {e.grado && <div className="small">{e.grado}</div>}
                {e.area && <div className="small text-muted">{e.area}</div>}
                <div className="text-muted small mt-1">
                  {[e.inicio, e.fin].filter(Boolean).join(' – ') || '—'}
                </div>
              </LineaTiempoItem>
            ))}
          </div>
        </div>
      )}

      {(datos.experienciaLaboral?.length ?? 0) > 0 && (
        <div className="col-12">
          <strong className="small text-muted d-block mb-2">
            <i className="bi bi-briefcase me-1" />
            Experiencia laboral
          </strong>
          <div>
            {datos.experienciaLaboral!.map((e, idx) => (
              <LineaTiempoItem key={idx} isLast={idx === datos.experienciaLaboral!.length - 1}>
                <div className="fw-semibold">{e.empresa ?? '—'}</div>
                {e.puesto && <div className="small">{e.puesto}</div>}
                <div className="text-muted small mt-1">
                  {[e.inicio, e.fin].filter(Boolean).join(' – ') || '—'}
                </div>
                {e.descripcion && (
                  <p className="small mb-0 mt-2" style={{ lineHeight: 1.6 }}>{e.descripcion}</p>
                )}
              </LineaTiempoItem>
            ))}
          </div>
        </div>
      )}

      {cursosUnificados.length > 0 && (
        <div className="col-12">
          <strong className="small text-muted d-block mb-1">Cursos y certificaciones</strong>
          <Table size="sm" responsive hover className="mb-0">
            <thead><tr><th>Curso</th><th>Institución</th><th>Fecha inicio</th><th>Fecha vence</th><th>Origen</th></tr></thead>
            <tbody>
              {cursosUnificados.map((c, idx) => (
                <tr key={idx}>
                  <td>{c.nombre}</td>
                  <td className="text-muted">{c.institucion ?? '—'}</td>
                  <td className="text-muted small">{c.fechaInicio ? formatDateOnly(c.fechaInicio) : '—'}</td>
                  <td className="text-muted small">{c.fechaVencimiento ? formatDateOnly(c.fechaVencimiento) : '—'}</td>
                  <td>
                    <span className={`badge badge-pill-enmv ${c.origen === 'ia' ? 'badge-estado-proceso' : 'badge-estado-aprobado'}`}>
                      {c.origen === 'ia' ? 'Detectado en CV' : 'Subido por postulante'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ExtraccionFormEdicion({ datos, onChange }: { datos: DatosCV; onChange: (d: DatosCV) => void }) {
  const set = (key: keyof DatosCV, value: unknown) => onChange({ ...datos, [key]: value });

  return (
    <div className="row g-3">
      <div className="col-md-3">
        <Form.Label className="small text-muted">Nombre</Form.Label>
        <Form.Control size="sm" value={datos.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} />
      </div>
      <div className="col-md-3">
        <Form.Label className="small text-muted">Apellidos</Form.Label>
        <Form.Control size="sm" value={datos.apellidos ?? ''} onChange={(e) => set('apellidos', e.target.value)} />
      </div>
      <div className="col-md-3">
        <Form.Label className="small text-muted">Email</Form.Label>
        <Form.Control size="sm" type="email" value={datos.email ?? ''} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div className="col-md-3">
        <Form.Label className="small text-muted">Teléfono</Form.Label>
        <Form.Control size="sm" value={datos.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} />
      </div>
      <div className="col-12">
        <Form.Label className="small text-muted">Resumen</Form.Label>
        <Form.Control as="textarea" rows={3} size="sm" value={datos.resumen ?? ''} onChange={(e) => set('resumen', e.target.value)} />
      </div>
      <div className="col-12">
        <Form.Label className="small text-muted">Habilidades (separadas por coma)</Form.Label>
        <Form.Control
          size="sm"
          value={(datos.habilidades ?? []).join(', ')}
          onChange={(e) => set('habilidades', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </div>
      <div className="col-12">
        <p className="text-muted small mb-0">
          Para editar estudios, experiencia, cursos e idiomas, confirma con los datos actuales y solicita una nueva extracción si es necesario.
        </p>
      </div>
    </div>
  );
}
