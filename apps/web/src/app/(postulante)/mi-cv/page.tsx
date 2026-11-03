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
import { DropZone } from '@/components/ui/DropZone';
import { DocumentoPreviewModal } from '@/components/documentos/DocumentoPreviewModal';
import { DocumentScanner, escanerDisponible } from '@/components/scanner';

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
  tipoMime?: string;
  urlDescargar?: string;
  urlVista?: string;
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

/** Mismo límite que la API (POST /documentos/subir). */
const LIMITE_CV_BYTES = 20 * 1024 * 1024;

export default function MiCVPage() {
  const router = useRouter();
  const [cvActual, setCVActual] = useState<CVActual | null>(null);
  const [historial, setHistorial] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewCV, setPreviewCV] = useState(false);
  const [escanerAbierto, setEscanerAbierto] = useState(false);

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

  /** Sube el CV. Si falla lanza un Error con el mensaje de la API; quien llama decide dónde mostrarlo. */
  const enviarCV = async (
    archivo: File,
    alProgreso?: (porcentaje: number) => void,
  ): Promise<CVActual> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('archivo', archivo);

      const config = {
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1),
          );
          setUploadProgress(percentCompleted);
          alProgreso?.(percentCompleted);
        },
      };

      const res = await api.post<CVActual>('/documentos/subir', formData, config);
      return res.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg = axiosErr.response?.data?.message ?? 'Error al subir el CV. Intenta de nuevo.';
      throw new Error(toErrorMessage(msg));
    } finally {
      setUploading(false);
    }
  };

  const avisarCVSubido = async (cv: CVActual) => {
    await Swal.fire({
      icon: 'success',
      title: '¡CV subido!',
      text: `Tu CV (v${cv.version}) ha sido guardado exitosamente.`,
      confirmButtonColor: '#0d6efd',
    });
    setSelectedFile(null);
    setUploadProgress(0);
    await cargarCV();
  };

  const subirCV = async () => {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo');
      return;
    }

    setError('');
    let cv: CVActual;
    try {
      cv = await enviarCV(selectedFile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir el CV. Intenta de nuevo.');
      return;
    }
    await avisarCVSubido(cv);
  };

  const abrirEscaner = () => {
    if (!escanerDisponible()) {
      setError('Tu navegador no permite escanear. Sube el archivo con la zona de arriba.');
      return;
    }
    setError('');
    setEscanerAbierto(true);
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
              <Card className="card-asommmn card-asommmn-top-verde card-riveted mb-4">
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
                    {cvActual.storageType !== 'local' && (
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setPreviewCV(true)}
                      >
                        👁 Ver
                      </Button>
                    )}
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
            <Card className="card-asommmn card-asommmn-top-dorado mb-4">
              <Card.Body>
                <h5 className="section-title mb-3">Cargar CV en PDF</h5>

                {error && (
                  <Alert variant="danger" className="mb-3">
                    {error}
                  </Alert>
                )}

                {/* Zona de Drag & Drop */}
                <div className="mb-3">
                  <DropZone
                    seleccionable
                    accept=".pdf,application/pdf"
                    etiquetaTipos="PDF"
                    maxSizeBytes={LIMITE_CV_BYTES}
                    loading={uploading}
                    onFiles={([archivo]) => handleFileSelect(archivo)}
                  >
                    <div className="mb-2">📁</div>
                    <p className="fw-bold mb-1">Arrastra tu CV aquí</p>
                    <p className="text-muted small">O haz clic para seleccionar</p>
                    <small className="text-muted d-block">Solo PDF, hasta 20 MB</small>
                  </DropZone>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <Button variant="outline-primary" size="sm" disabled={uploading} onClick={abrirEscaner}>
                    <i className="bi bi-camera me-1" aria-hidden="true" />
                    Escanear con cámara
                  </Button>
                  <span className="text-muted small">Escanea tu CV impreso y se sube como PDF.</span>
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
              <Card className="card-asommmn card-asommmn-top-azul">
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
                                <span className="badge badge-pill-asommmn badge-estado-aprobado ms-2">Actual</span>
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

            <Card className="card-asommmn card-asommmn-top-azul mt-4">
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
      {escanerAbierto && (
        <DocumentScanner
          etiqueta="CV"
          onCerrar={() => setEscanerAbierto(false)}
          // Sigue abierto hasta que la subida termina bien: si falla, el Error se
          // muestra dentro del escáner y las páginas se conservan para reintentar.
          onListo={async (archivo, alProgreso) => {
            const cv = await enviarCV(archivo, alProgreso);
            setEscanerAbierto(false);
            await avisarCVSubido(cv);
          }}
        />
      )}
      {previewCV && cvActual && (
        <DocumentoPreviewModal
          show
          onHide={() => setPreviewCV(false)}
          titulo="CV"
          nombreArchivo={cvActual.nombreOriginal}
          cargar={async () => {
            const res = await api.get<CVActual>(`/documentos/${cvActual._id}/descargar`);
            if (!res.data.urlVista) throw new Error('Documento no disponible.');
            return { url: res.data.urlVista, mimeType: res.data.tipoMime ?? 'application/pdf' };
          }}
          onDescargar={() => descargarCV(cvActual._id)}
        />
      )}
    </div>
  );
}
