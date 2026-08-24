'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Row,
  Table,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { IconTimon, SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';

// ── Types ────────────────────────────────────────────────────────────────────

type CursoItem = {
  _id: string;
  nombreCurso: string;
  institucion?: string;
  fechaCurso: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  tieneDocumentoExtra: boolean;
  documentoExtra?: {
    nombreOriginal: string;
    tamanio: number;
    tipoMime: string;
    urlDescargar?: string;
    storageType?: 'local' | 'cloudinary';
  };
};

type CursosResponse = {
  postulante: { id: string; nombreCompleto: string; email: string };
  cursos: CursoItem[];
  total: number;
};

type IaResult = {
  nombreCurso: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  /** Fecha de finalización/emisión cuando no hay inicio ni vencimiento explícitos */
  fechaEmision: string | null;
  confianza: { nombreCurso: string; fechaInicio: string; fechaVencimiento: string };
  iaDisponible: boolean;
  errorMensaje?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toErrorMessage(msg: unknown): string {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
}

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-MX'); } catch { return iso; }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ConfianzaBadge({ nivel }: { nivel: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    alta:  { bg: 'success', text: 'white',  label: '✓ alta' },
    media: { bg: 'warning', text: 'dark',   label: '~ media' },
    baja:  { bg: 'danger',  text: 'white',  label: '! baja' },
  };
  const cfg = map[nivel] ?? map.baja;
  return (
    <Badge bg={cfg.bg} text={cfg.text} className="ms-1" style={{ fontSize: '0.65rem' }}>
      {cfg.label}
    </Badge>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MisCursosPage() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [data, setData]             = useState<CursosResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // AI flow
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [iaLoading, setIaLoading]       = useState(false);
  const [iaResult, setIaResult]         = useState<IaResult | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [formNombre, setFormNombre]     = useState('');
  const [formInicio, setFormInicio]     = useState('');
  const [formVence, setFormVence]       = useState('');

  const cargarCursos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<CursosResponse>('/cursos/mis-cursos');
      setData(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudieron cargar los cursos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => { await cargarCursos(); };
    init();
  }, [cargarCursos]);

  // ── Upload + AI extraction ──────────────────────────────────────────────

  const iniciarFlujoIA = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se aceptan archivos PDF.');
      return;
    }
    setError('');
    setPendingFile(file);
    setIaLoading(true);
    setShowForm(false);
    setIaResult(null);

    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post<IaResult>('/cursos/extraer-ia', fd);
      const proposal = res.data;
      setIaResult(proposal);
      setFormNombre(proposal.nombreCurso ?? '');
      // Si no hay fecha de inicio explícita, usa la fecha de emisión/finalización como referencia
      setFormInicio(proposal.fechaInicio ?? proposal.fechaEmision ?? '');
      setFormVence(proposal.fechaVencimiento ?? '');
    } catch {
      setIaResult({
        nombreCurso: null, fechaInicio: null, fechaVencimiento: null, fechaEmision: null,
        confianza: { nombreCurso: 'baja', fechaInicio: 'baja', fechaVencimiento: 'baja' },
        iaDisponible: false,
        errorMensaje: 'No se pudo conectar con el servicio de IA. Ingresa los datos manualmente.',
      });
      setFormNombre('');
      setFormInicio('');
      setFormVence('');
    } finally {
      setIaLoading(false);
      setShowForm(true);
    }
  };

  const cancelarForm = () => {
    setPendingFile(null);
    setIaResult(null);
    setShowForm(false);
    setFormNombre('');
    setFormInicio('');
    setFormVence('');
  };

  const guardarCurso = async () => {
    if (!pendingFile) return;
    if (!formNombre.trim()) {
      setError('El nombre del curso es obligatorio.');
      return;
    }
    const fechaCurso = formInicio || new Date().toISOString().slice(0, 10);

    try {
      setSaving(true);
      setError('');
      const fd = new FormData();
      fd.append('nombreCurso', formNombre.trim());
      fd.append('fechaCurso', fechaCurso);
      fd.append('apareceEnCV', 'false');
      if (formInicio) fd.append('fechaInicio', formInicio);
      if (formVence)  fd.append('fechaVencimiento', formVence);
      fd.append('documentoExtra', pendingFile);

      await api.post('/cursos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      await Swal.fire({
        icon: 'success',
        title: 'Certificado guardado',
        text: `"${formNombre.trim()}" registrado correctamente.`,
        timer: 1800,
        showConfirmButton: false,
      });

      cancelarForm();
      await cargarCursos();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudo guardar el curso.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await iniciarFlujoIA(file);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await iniciarFlujoIA(file);
    e.target.value = '';
  };

  // ── Row actions ────────────────────────────────────────────────────────

  const renombrarCurso = async (cursoId: string, nombreActual: string) => {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Renombrar curso',
      input: 'text',
      inputLabel: 'Nuevo nombre del curso',
      inputValue: nombreActual,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'El nombre no puede estar vacío.' : null),
    });
    if (!isConfirmed || !value?.trim()) return;
    try {
      await api.patch(`/cursos/${cursoId}/renombrar`, { nombreCurso: value.trim() });
      await cargarCursos();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudo renombrar.'));
    }
  };

  const eliminarCurso = async (cursoId: string) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar este curso o certificación?',
      text: 'Se eliminará permanentemente de tu expediente, junto con su certificado si tiene uno. No se puede deshacer.',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`/cursos/${cursoId}`);
      await cargarCursos();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudo eliminar.'));
    }
  };

  if (loading) {
    return (
      <div className="nautical-panel nautical-panel-postulante d-flex justify-content-center py-5">
        <SpinnerTimon size={44} />
      </div>
    );
  }

  const iaOk = iaResult?.iaDisponible && !iaResult.errorMensaje;

  return (
    <div className="py-4 nautical-panel nautical-panel-postulante" style={{ minHeight: '100vh' }}>
      <div className="container">
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>
        <Row className="g-4">

          {/* ── Panel izquierdo: upload / formulario de confirmación ── */}
          <Col lg={5}>
            <Card className="card-enmv card-enmv-top-dorado">
              <Card.Body>

                {error && (
                  <Alert variant="danger" dismissible onClose={() => setError('')}>
                    {error}
                  </Alert>
                )}

                {/* Estado 1: sin archivo pendiente → zona de carga */}
                {!showForm && !iaLoading && (
                  <>
                    <p className="text-muted small mb-3">
                      Arrastra un PDF de certificado. La IA leerá el contenido y propondrá
                      el nombre real del curso y las fechas para que las confirmes.
                    </p>
                    <div
                      className={`border-2 border-dashed rounded p-4 text-center mb-3 ${
                        dragActive ? 'border-primary bg-light' : 'border-secondary'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      style={{ cursor: 'pointer', borderWidth: '2px' }}
                    >
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileInput}
                        id="certInput"
                        hidden
                      />
                      <label htmlFor="certInput" style={{ cursor: 'pointer' }}>
                        <div className="mb-2" style={{ fontSize: '2rem' }}>📄</div>
                        <p className="fw-bold mb-1">Arrastra tu certificado PDF aquí</p>
                        <p className="text-muted small mb-0">O haz clic para seleccionar</p>
                      </label>
                    </div>
                    <div className="text-muted small">Un archivo PDF por vez.</div>
                  </>
                )}

                {/* Estado 2: procesando con IA */}
                {iaLoading && (
                  <div className="text-center py-4">
                    <SpinnerTimon size={40} className="mb-3" />
                    <p className="fw-semibold" style={{ color: 'var(--enmv-azul)' }}>
                      Analizando PDF con IA…
                    </p>
                    <p className="text-muted small">
                      Extrayendo nombre del curso y fechas del documento.
                    </p>
                    {pendingFile && (
                      <div className="bg-light rounded px-3 py-2 small d-inline-block mt-2">
                        📄 {pendingFile.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Estado 3: formulario de confirmación */}
                {showForm && !iaLoading && (
                  <>
                    {iaOk ? (
                      <Alert variant="info" className="py-2 small mb-3">
                        <strong>✨ Propuesta de la IA</strong> — Revisa y corrige si es necesario.
                      </Alert>
                    ) : (
                      <Alert variant="warning" className="py-2 small mb-3">
                        <strong>Entrada manual</strong> —{' '}
                        {iaResult?.errorMensaje ?? 'Ingresa los datos del certificado.'}
                      </Alert>
                    )}

                    {pendingFile && (
                      <div className="bg-light rounded px-3 py-2 small mb-3">
                        📄 <strong>{pendingFile.name}</strong>{' '}
                        ({formatSize(pendingFile.size)})
                      </div>
                    )}

                    <Form>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-semibold">
                          Nombre del curso / certificación <span className="text-danger">*</span>
                          {iaOk && iaResult?.confianza?.nombreCurso && (
                            <ConfianzaBadge nivel={iaResult.confianza.nombreCurso} />
                          )}
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          value={formNombre}
                          onChange={(e) => setFormNombre(e.target.value)}
                          placeholder="Nombre oficial tal como aparece en el certificado"
                          maxLength={200}
                        />
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-semibold">
                          Fecha de inicio / emisión / finalización
                          {iaOk && iaResult?.confianza?.fechaInicio && (
                            <ConfianzaBadge nivel={iaResult.confianza.fechaInicio} />
                          )}
                          {iaOk && !iaResult?.fechaInicio && iaResult?.fechaEmision && (
                            <span className="ms-1 text-muted" style={{ fontSize: '0.65rem', fontWeight: 'normal' }}>
                              (fecha de finalización del cert.)
                            </span>
                          )}
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="date"
                          value={formInicio}
                          onChange={(e) => setFormInicio(e.target.value)}
                        />
                      </Form.Group>

                      <Form.Group className="mb-4">
                        <Form.Label className="small fw-semibold">
                          Fecha de vencimiento (si aplica)
                          {iaOk && iaResult?.confianza?.fechaVencimiento && (
                            <ConfianzaBadge nivel={iaResult.confianza.fechaVencimiento} />
                          )}
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="date"
                          value={formVence}
                          onChange={(e) => setFormVence(e.target.value)}
                        />
                        <Form.Text className="text-muted">Dejar vacío si el certificado no vence.</Form.Text>
                      </Form.Group>

                      <div className="d-flex gap-2">
                        <Button
                          size="sm"
                          style={{ background: 'var(--enmv-azul)', borderColor: 'var(--enmv-azul)' }}
                          disabled={saving || !formNombre.trim()}
                          onClick={() => void guardarCurso()}
                        >
                          {saving ? <><SpinnerTimon size={14} className="me-1" />Guardando…</> : '💾 Guardar curso'}
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={cancelarForm} disabled={saving}>
                          Cancelar
                        </Button>
                      </div>
                    </Form>
                  </>
                )}

              </Card.Body>
            </Card>
          </Col>

          {/* ── Panel derecho: tabla de cursos ── */}
          <Col lg={7}>
            <Card className="card-enmv card-enmv-top-azul card-riveted">
              <Card.Body>
                <h5 className="section-title mb-3" style={{ fontSize: '1rem' }}>
                  <IconTimon size={16} className="nautical-icon" />
                  Tus cursos y certificaciones
                </h5>

                {!data || data.total === 0 ? (
                  <Alert variant="secondary" className="mb-0">
                    Aún no has registrado cursos o certificaciones.
                  </Alert>
                ) : (
                  <div className="table-responsive">
                    <Table hover className="align-middle mb-0" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Curso</th>
                          <th style={{ whiteSpace: 'nowrap' }}>Fecha inicio</th>
                          <th style={{ whiteSpace: 'nowrap' }}>Fecha vence</th>
                          <th>Documento</th>
                          <th className="text-end"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cursos.map((curso) => {
                          const vencido =
                            curso.fechaVencimiento &&
                            new Date(curso.fechaVencimiento) < new Date();
                          return (
                            <tr key={curso._id}>
                              <td>
                                <div className="fw-semibold">{curso.nombreCurso}</div>
                                {curso.institucion && (
                                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    {curso.institucion}
                                  </div>
                                )}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatDate(curso.fechaInicio ?? curso.fechaCurso)}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {curso.fechaVencimiento ? (
                                  <span style={{ color: vencido ? '#dc3545' : undefined }}>
                                    {formatDate(curso.fechaVencimiento)}
                                    {vencido && (
                                      <Badge bg="danger" className="ms-1" style={{ fontSize: '0.6rem' }}>
                                        Vencido
                                      </Badge>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-muted">Sin vencimiento</span>
                                )}
                              </td>
                              <td>
                                {curso.documentoExtra?.urlDescargar ? (
                                  <a
                                    href={curso.documentoExtra.urlDescargar}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="small"
                                    title={curso.documentoExtra.nombreOriginal}
                                  >
                                    📥 {formatSize(curso.documentoExtra.tamanio)}
                                  </a>
                                ) : curso.documentoExtra ? (
                                  <span
                                    className="text-warning small"
                                    title="Archivo de una versión anterior del sistema; vuelve a subirlo."
                                  >
                                    ⚠️ Vuelve a subirlo
                                  </span>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    onClick={() => void renombrarCurso(curso._id, curso.nombreCurso)}
                                  >
                                    ✏️ Renombrar
                                  </Button>
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => void eliminarCurso(curso._id)}
                                  >
                                    🗑 Eliminar
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

        </Row>
      </div>
    </div>
  );
}
