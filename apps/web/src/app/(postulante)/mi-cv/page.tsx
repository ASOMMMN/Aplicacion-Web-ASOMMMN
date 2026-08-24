'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Alert,
  ProgressBar,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';

interface Documento {
  _id: string;
  nombreOriginal: string;
  tamanio: number;
  version: number;
  esActual: boolean;
  subidasEn: string;
}

interface CVActual {
  _id: string;
  nombreOriginal: string;
  tamanio: number;
  version: number;
  subidasEn: string;
  urlDescargar?: string;
  storageType?: 'local' | 'cloudinary';
}

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) {
    return msg.map((item) => String(item)).join(', ');
  }
  if (
    msg &&
    typeof msg === 'object' &&
    'message' in msg &&
    (msg as { message?: unknown }).message !== undefined
  ) {
    return toErrorMessage((msg as { message?: unknown }).message);
  }
  if (msg && typeof msg === 'object') {
    return JSON.stringify(msg);
  }
  return String(msg);
};

export default function MiCVPage() {
  const router = useRouter();
  const [cvActual, setCVActual] = useState<CVActual | null>(null);
  const [historial, setHistorial] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const cargarCV = useCallback(async () => {
    try {
      setLoading(true);
      const [actualRes, historialRes] = await Promise.all([
        api.get<CVActual>('/documentos/mi-cv').catch(() => ({ data: null })),
        api.get('/documentos/historial').catch(() => ({ data: { documentos: [] } })),
      ]);

      setCVActual(actualRes.data);
      setHistorial(historialRes.data?.documentos ?? []);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      console.error(err);
      setError(
        toErrorMessage(axiosErr.response?.data?.message ?? 'Error al cargar los documentos'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => { await cargarCV(); };
    init();
  }, [cargarCV]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;

    // Validaciones
    if (file.type !== 'application/pdf') {
      setError('Solo se aceptan archivos PDF');
      return;
    }

    setError('');
    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const subirCV = async () => {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('archivo', selectedFile);

      // Aquí es donde simularíamos el progreso
      const config = {
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1),
          );
          setUploadProgress(percentCompleted);
        },
      };

      const res = await api.post<CVActual>('/documentos/subir', formData, config);

      await Swal.fire({
        icon: 'success',
        title: '¡CV subido!',
        text: `Tu CV (v${res.data.version}) ha sido guardado exitosamente.`,
        confirmButtonColor: '#0d6efd',
      });

      setSelectedFile(null);
      setUploadProgress(0);
      await cargarCV();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg = axiosErr.response?.data?.message ?? 'Error al subir el CV. Intenta de nuevo.';
      setError(toErrorMessage(msg));
    } finally {
      setUploading(false);
    }
  };

  const descargarCV = async (documentoId: string) => {
    try {
      const res = await api.get<CVActual>(`/documentos/${documentoId}/descargar`);
      if (!res.data.urlDescargar) {
        void Swal.fire({
          icon: 'warning',
          title: 'Archivo no disponible',
          text: 'Este CV es de una versión anterior del sistema y ya no está disponible. Vuelve a subirlo.',
        });
        return;
      }
      window.open(res.data.urlDescargar, '_blank');
    } catch {
      void Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo descargar el documento.' });
    }
  };

  const eliminarCV = async (documentoId: string) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta versión del CV?',
      text: 'El archivo se eliminará permanentemente de tu expediente y no podrás recuperarlo.',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`/documentos/${documentoId}`);
      await cargarCV();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      void Swal.fire({ icon: 'error', title: 'Error', text: toErrorMessage(axiosErr.response?.data?.message ?? 'No se pudo eliminar.') });
    }
  };

  const renombrarCV = async (documentoId: string, nombreActual: string) => {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Renombrar archivo',
      input: 'text',
      inputLabel: 'Nuevo nombre',
      inputValue: nombreActual,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'El nombre no puede estar vacío.' : null),
    });
    if (!isConfirmed || !value?.trim()) return;
    try {
      await api.patch(`/documentos/${documentoId}/renombrar`, { nombreOriginal: value.trim() });
      await cargarCV();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      void Swal.fire({ icon: 'error', title: 'Error', text: toErrorMessage(axiosErr.response?.data?.message ?? 'No se pudo renombrar.') });
    }
  };

  if (loading) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante d-flex align-items-center justify-content-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  return (
    <div className="py-4 nautical-panel nautical-panel-postulante" style={{ minHeight: '100vh' }}>
      <Container>
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col lg={8}>
            {/* Card: CV Actual */}
            {cvActual && (
              <Card className="card-enmv card-enmv-top-verde card-riveted mb-4">
                <Card.Body>
                  <h5 className="section-title mb-3">CV actual</h5>
                  <div className="bg-light p-3 rounded mb-3">
                    <p className="mb-1">
                      <strong>{cvActual.nombreOriginal}</strong>
                    </p>
                    <p className="text-muted small mb-0">
                      Versión {cvActual.version} • {formatFileSize(cvActual.tamanio)} •{' '}
                      {formatDate(cvActual.subidasEn)}
                    </p>
                  </div>
                  {cvActual.storageType === 'local' && (
                    <p className="text-warning small mb-3">
                      ⚠️ Este archivo es de una versión anterior del sistema y ya no está disponible. Vuelve a subirlo.
                    </p>
                  )}
                  <div className="d-flex gap-2 flex-wrap">
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => descargarCV(cvActual._id)}
                    >
                      📥 Descargar
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => void renombrarCV(cvActual._id, cvActual.nombreOriginal)}
                    >
                      ✏️ Renombrar
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => void eliminarCV(cvActual._id)}
                    >
                      🗑 Eliminar
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            )}

            {/* Card: Subir Nuevo CV */}
            <Card className="card-enmv card-enmv-top-dorado mb-4">
              <Card.Body>
                <h5 className="section-title mb-3">Cargar CV en PDF</h5>

                {error && (
                  <Alert variant="danger" className="mb-3">
                    {error}
                  </Alert>
                )}

                {/* Zona de Drag & Drop */}
                <div
                  className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition mb-3 ${
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
                    id="fileInput"
                    hidden
                  />
                  <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
                    <div className="mb-2">📁</div>
                    <p className="fw-bold mb-1">Arrastra tu CV aquí</p>
                    <p className="text-muted small">O haz clic para seleccionar</p>
                    <small className="text-muted d-block">
                      Solo PDF, sin límite de tamaño
                    </small>
                  </label>
                </div>

                {/* Archivo Seleccionado */}
                {selectedFile && (
                  <div className="bg-light p-3 rounded mb-3 d-flex justify-content-between align-items-center">
                    <div>
                      <p className="small mb-1">
                        <strong>{selectedFile.name}</strong>
                      </p>
                      <p className="text-muted small mb-0">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      ✕ Quitar
                    </Button>
                  </div>
                )}

                {/* Barra de Progreso */}
                {uploading && (
                  <div className="mb-3">
                    <ProgressBar
                      animated
                      now={uploadProgress}
                      label={`${uploadProgress}%`}
                    />
                  </div>
                )}

                {/* Botones */}
                <div className="d-flex gap-2">
                  <Button
                    variant="primary"
                    disabled={!selectedFile || uploading}
                    onClick={subirCV}
                  >
                    {uploading ? (
                      <>
                        <SpinnerTimon size={14} className="me-2" />
                        Subiendo...
                      </>
                    ) : (
                      'Subir CV'
                    )}
                  </Button>
                  {selectedFile && (
                    <Button
                      variant="outline-secondary"
                      onClick={() => setSelectedFile(null)}
                      disabled={uploading}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </Card.Body>
            </Card>

            <div className="horizonte-divider" />

            {/* Card: Historial */}
            {historial.length > 0 && (
              <Card className="card-enmv card-enmv-top-azul">
                <Card.Body>
                  <h5 className="section-title mb-3">Historial de versiones</h5>
                  <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Versión</th>
                          <th>Nombre</th>
                          <th>Tamaño</th>
                          <th>Fecha</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((doc) => (
                          <tr key={doc._id}>
                            <td>
                              <strong>v{doc.version}</strong>
                              {doc.esActual && (
                                <span className="badge badge-pill-enmv badge-estado-aprobado ms-2">Actual</span>
                              )}
                            </td>
                            <td className="small">{doc.nombreOriginal}</td>
                            <td className="small text-muted">
                              {formatFileSize(doc.tamanio)}
                            </td>
                            <td className="small text-muted">
                              {formatDate(doc.subidasEn)}
                            </td>
                            <td>
                              <div className="d-flex gap-2 flex-wrap">
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  onClick={() => descargarCV(doc._id)}
                                >
                                  📥 Descargar
                                </Button>
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  onClick={() => void renombrarCV(doc._id, doc.nombreOriginal)}
                                >
                                  ✏️ Renombrar
                                </Button>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => void eliminarCV(doc._id)}
                                >
                                  🗑 Eliminar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card.Body>
              </Card>
            )}

            <Card className="card-enmv card-enmv-top-azul mt-4">
              <Card.Body>
                <h5 className="section-title mb-2">Certificados de cursos y certificaciones</h5>
                <p className="text-muted small mb-3">
                  En este apartado adicional puedes subir PDFs de tus cursos o certificaciones.
                  Si un curso no aparece en tu CV, su PDF es obligatorio.
                </p>
                <Button variant="outline-primary" onClick={() => router.push('/mis-cursos')}>
                  Ir a mis cursos y certificados
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
