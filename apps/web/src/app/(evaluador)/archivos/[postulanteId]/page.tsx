'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Col,
  Container,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';

interface EvalItem {
  _id: string;
  nombre: string;
  tipo: 'archivo' | 'carpeta';
  carpeta: string;
  tipoMime?: string;
  tamanio?: number;
  creadoEn: string;
  urlDescargar?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function carpetaSegmentos(carpeta: string): string[] {
  if (!carpeta) return [];
  return carpeta.split('/').filter(Boolean);
}

export default function EvalArchivosPage() {
  const params = useParams<{ postulanteId: string }>();
  const postulanteId = String(params?.postulanteId ?? '');

  const [carpetaActual, setCarpetaActual] = useState('');
  const [items, setItems] = useState<EvalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState<EvalItem[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const [showCarpetaModal, setShowCarpetaModal] = useState(false);
  const [nuevaCarpeta, setNuevaCarpeta] = useState('');
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);

  const [showMoverModal, setShowMoverModal] = useState(false);
  const [moviendoId, setMoviendoId] = useState('');
  const [destinoMover, setDestinoMover] = useState('');
  const [moviendo, setMoviendo] = useState(false);

  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!postulanteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get<EvalItem[]>(
        `/eval-archivos/${postulanteId}?carpeta=${encodeURIComponent(carpetaActual)}`,
      );
      setItems(res.data ?? []);
    } catch {
      setError('No se pudo cargar la carpeta.');
    } finally {
      setLoading(false);
    }
  }, [postulanteId, carpetaActual]);

  useEffect(() => {
    const init = async () => {
      setResultadosBusqueda(null);
      setBusqueda('');
      await cargar();
    };
    init();
  }, [cargar]);

  const navegar = (nombre: string) => {
    const nueva = carpetaActual ? `${carpetaActual}/${nombre}` : nombre;
    setCarpetaActual(nueva);
  };

  const subirA = (segmentoIndex: number) => {
    const segs = carpetaSegmentos(carpetaActual);
    setCarpetaActual(segs.slice(0, segmentoIndex).join('/'));
  };

  const buscar = async () => {
    if (!busqueda.trim()) { setResultadosBusqueda(null); return; }
    setBuscando(true);
    try {
      const res = await api.get<EvalItem[]>(
        `/eval-archivos/${postulanteId}/buscar?q=${encodeURIComponent(busqueda)}`,
      );
      setResultadosBusqueda(res.data ?? []);
    } catch {
      setResultadosBusqueda([]);
    } finally {
      setBuscando(false);
    }
  };

  const crearCarpeta = async () => {
    if (!nuevaCarpeta.trim()) return;
    setCreandoCarpeta(true);
    try {
      await api.post(`/eval-archivos/${postulanteId}/carpeta`, {
        nombre: nuevaCarpeta.trim(),
        carpeta: carpetaActual,
      });
      setShowCarpetaModal(false);
      setNuevaCarpeta('');
      await cargar();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      await Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'No se pudo crear la carpeta.' });
    } finally {
      setCreandoCarpeta(false);
    }
  };

  const subirArchivo = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    setSubiendoId(file.name);
    try {
      await api.post(
        `/eval-archivos/${postulanteId}/upload?carpeta=${encodeURIComponent(carpetaActual)}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      await cargar();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      await Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'No se pudo subir el archivo.' });
    } finally {
      setSubiendoId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const eliminar = async (item: EvalItem) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: `Eliminar ${item.tipo === 'carpeta' ? 'carpeta' : 'archivo'}`,
      text: `¿Eliminar "${item.nombre}"? Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;
    try {
      await api.delete(`/eval-archivos/${postulanteId}/${item._id}`);
      await cargar();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      await Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'No se pudo eliminar.' });
    }
  };

  const abrirMover = (item: EvalItem) => {
    setMoviendoId(item._id);
    setDestinoMover(item.carpeta);
    setShowMoverModal(true);
  };

  const mover = async () => {
    setMoviendo(true);
    try {
      await api.patch(`/eval-archivos/${postulanteId}/${moviendoId}/mover`, {
        destino: destinoMover,
      });
      setShowMoverModal(false);
      await cargar();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      await Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'No se pudo mover.' });
    } finally {
      setMoviendo(false);
    }
  };

  const segmentos = carpetaSegmentos(carpetaActual);
  const listaActiva = resultadosBusqueda ?? items;

  return (
    <Container fluid className="py-4 bg-light min-vh-100">
      <Row className="mb-3 align-items-center">
        <Col>
          <Link href={`/candidato/${postulanteId}`} className="btn btn-outline-secondary btn-sm me-2">
            Volver al candidato
          </Link>
          <span className="fw-bold fs-5">Archivos del evaluador</span>
        </Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button variant="outline-primary" size="sm" onClick={() => setShowCarpetaModal(true)}>
            + Carpeta
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoId !== null}
          >
            {subiendoId ? <Spinner size="sm" /> : 'Subir archivo'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="d-none"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subirArchivo(f);
            }}
          />
        </Col>
      </Row>

      {/* Búsqueda */}
      <Row className="mb-3">
        <Col md={5}>
          <InputGroup size="sm">
            <Form.Control
              placeholder="Buscar archivos..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                if (!e.target.value.trim()) setResultadosBusqueda(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
            />
            <Button variant="outline-secondary" onClick={buscar} disabled={buscando}>
              {buscando ? <Spinner size="sm" /> : 'Buscar'}
            </Button>
            {resultadosBusqueda !== null && (
              <Button
                variant="outline-danger"
                onClick={() => { setResultadosBusqueda(null); setBusqueda(''); }}
              >
                x
              </Button>
            )}
          </InputGroup>
        </Col>
      </Row>

      {/* Breadcrumb */}
      {!resultadosBusqueda && (
        <Breadcrumb className="mb-2 small">
          <Breadcrumb.Item onClick={() => setCarpetaActual('')} active={carpetaActual === ''}>
            Raiz
          </Breadcrumb.Item>
          {segmentos.map((seg, i) => (
            <Breadcrumb.Item
              key={i}
              onClick={() => subirA(i + 1)}
              active={i === segmentos.length - 1}
            >
              {seg}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      )}

      {resultadosBusqueda !== null && (
        <Alert variant="info" className="py-2 small">
          Resultados para <strong>&ldquo;{busqueda}&rdquo;</strong>: {resultadosBusqueda.length} encontrado(s)
        </Alert>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : listaActiva.length === 0 ? (
            <div className="text-center text-muted py-5">
              {resultadosBusqueda !== null ? 'Sin resultados.' : 'Esta carpeta está vacía.'}
            </div>
          ) : (
            <Table hover responsive className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  {resultadosBusqueda && <th>Ruta</th>}
                  <th>Tipo</th>
                  <th>Tamaño</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaActiva.map((item) => (
                  <tr key={item._id}>
                    <td>
                      {item.tipo === 'carpeta' ? (
                        <span
                          role="button"
                          className="text-primary fw-semibold"
                          onClick={() => navegar(item.nombre)}
                        >
                          📁 {item.nombre}
                        </span>
                      ) : (
                        <span>📄 {item.nombre}</span>
                      )}
                    </td>
                    {resultadosBusqueda && (
                      <td className="text-muted small">{item.carpeta || '/'}</td>
                    )}
                    <td>
                      {item.tipo === 'carpeta' ? (
                        <Badge bg="secondary">Carpeta</Badge>
                      ) : (
                        <Badge bg="light" text="dark" className="border">
                          {item.tipoMime?.split('/')[1]?.toUpperCase() ?? 'FILE'}
                        </Badge>
                      )}
                    </td>
                    <td className="small text-muted">{item.tipo === 'archivo' ? formatBytes(item.tamanio ?? 0) : '—'}</td>
                    <td className="small text-muted">
                      {new Date(item.creadoEn).toLocaleDateString('es-ES')}
                    </td>
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end flex-wrap">
                        {item.tipo === 'archivo' && item.urlDescargar && (
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => window.open(item.urlDescargar, '_blank')}
                          >
                            Descargar
                          </Button>
                        )}
                        {item.tipo === 'archivo' && (
                          <Button variant="outline-secondary" size="sm" onClick={() => abrirMover(item)}>
                            Mover
                          </Button>
                        )}
                        <Button variant="outline-danger" size="sm" onClick={() => eliminar(item)}>
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Modal: crear carpeta */}
      <Modal show={showCarpetaModal} onHide={() => setShowCarpetaModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Nueva carpeta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            placeholder="Nombre de la carpeta"
            value={nuevaCarpeta}
            onChange={(e) => setNuevaCarpeta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && crearCarpeta()}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCarpetaModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={crearCarpeta} disabled={creandoCarpeta}>
            {creandoCarpeta ? <Spinner size="sm" /> : 'Crear'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: mover archivo */}
      <Modal show={showMoverModal} onHide={() => setShowMoverModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Mover archivo</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Carpeta destino (vacío = raíz)</Form.Label>
          <Form.Control
            placeholder="ej. documentos/contratos"
            value={destinoMover}
            onChange={(e) => setDestinoMover(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMoverModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={mover} disabled={moviendo}>
            {moviendo ? <Spinner size="sm" /> : 'Mover'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
