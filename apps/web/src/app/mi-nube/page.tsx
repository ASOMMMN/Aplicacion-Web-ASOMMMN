"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Col,
  Form,
  InputGroup,
  Modal,
  ProgressBar,
  Row,
  Table,
} from "react-bootstrap";
import Swal from "sweetalert2";
import { DocumentoNubeItem, miNubeApi } from "@/lib/api/miNube";
import { SpinnerTimon } from "@/components/ui/NauticalIcons";
import { BotonVolver } from "@/components/ui/BotonVolver";

type TrailItem = { id: string | null; nombre: string };

const ROOT: TrailItem = { id: null, nombre: "Raíz" };

function getErrorMessage(error: unknown): string {
  const candidate = error as {
    response?: { data?: { message?: unknown } };
    message?: string;
  };
  const message = candidate.response?.data?.message ?? candidate.message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return String(message ?? "Ocurrió un error inesperado.");
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function canPreview(item: DocumentoNubeItem) {
  return Boolean(
    item.mimeType?.startsWith("image/") || item.mimeType === "application/pdf",
  );
}

function downloadObjectUrl(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function MiNubePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<DocumentoNubeItem[]>([]);
  const [searchResults, setSearchResults] = useState<
    DocumentoNubeItem[] | null
  >(null);
  const [trail, setTrail] = useState<TrailItem[]>([ROOT]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renameTarget, setRenameTarget] = useState<DocumentoNubeItem | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");

  const [moveTarget, setMoveTarget] = useState<DocumentoNubeItem | null>(null);
  const [moveParentId, setMoveParentId] = useState<string>("");
  const [folderSearch, setFolderSearch] = useState("");
  const [folderOptions, setFolderOptions] = useState<DocumentoNubeItem[]>([]);

  const currentParentId = useMemo(
    () => trail[trail.length - 1]?.id ?? null,
    [trail],
  );
  const visibleItems = searchResults ?? items;
  const isSearching = searchResults !== null;

  const cargar = useCallback(async (parentId: string | null) => {
    try {
      setLoading(true);
      setError("");
      const data = await miNubeApi.listar(parentId);
      setItems(data.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void cargar(currentParentId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cargar, currentParentId]);

  const entrarCarpeta = (item: DocumentoNubeItem) => {
    if (item.tipo !== "folder") return;
    setSearch("");
    setSearchResults(null);
    setTrail((prev) => [...prev, { id: item.id, nombre: item.nombre }]);
  };

  const irABreadcrumb = (index: number) => {
    setSearch("");
    setSearchResults(null);
    setTrail((prev) => prev.slice(0, index + 1));
  };

  const buscar = async () => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    if (q.length < 2) {
      await Swal.fire({
        icon: "info",
        title: "Búsqueda muy corta",
        text: "Escribe al menos 2 caracteres.",
      });
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSearchResults(await miNubeApi.buscar(q));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const crearCarpeta = async () => {
    if (!newFolderName.trim()) return;
    try {
      setWorking(true);
      await miNubeApi.crearCarpeta(newFolderName.trim(), currentParentId);
      setShowFolderModal(false);
      setNewFolderName("");
      await cargar(currentParentId);
      await Swal.fire({ icon: "success", title: "Carpeta creada" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo crear",
        text: getErrorMessage(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const subirArchivos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
      setWorking(true);
      setUploadProgress(0);
      for (const [index, file] of files.entries()) {
        await miNubeApi.subirArchivo(file, currentParentId, (progress) => {
          const base = (index * 100) / files.length;
          setUploadProgress(Math.round(base + progress / files.length));
        });
      }
      await cargar(currentParentId);
      await Swal.fire({ icon: "success", title: "Archivo cargado" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo subir",
        text: getErrorMessage(err),
      });
    } finally {
      setWorking(false);
      setUploadProgress(0);
    }
  };

  const ver = async (item: DocumentoNubeItem) => {
    if (!canPreview(item)) {
      await Swal.fire({
        icon: "info",
        title: "Vista no disponible",
        text: "Solo se pueden ver PDF e imágenes en navegador.",
      });
      return;
    }

    try {
      const blob = await miNubeApi.verBlob(item.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo abrir",
        text: getErrorMessage(err),
      });
    }
  };

  const descargar = async (item: DocumentoNubeItem) => {
    try {
      const blob = await miNubeApi.descargarBlob(item.id);
      downloadObjectUrl(blob, item.nombre);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo descargar",
        text: getErrorMessage(err),
      });
    }
  };

  const confirmarRenombrar = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      setWorking(true);
      await miNubeApi.renombrar(renameTarget.id, renameValue.trim());
      setRenameTarget(null);
      setRenameValue("");
      await cargar(currentParentId);
      await Swal.fire({ icon: "success", title: "Nombre actualizado" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo renombrar",
        text: getErrorMessage(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const abrirMover = (item: DocumentoNubeItem) => {
    setMoveTarget(item);
    setMoveParentId("");
    setFolderSearch("");
    setFolderOptions(items.filter((candidate) => candidate.tipo === "folder"));
  };

  const buscarCarpetasDestino = async () => {
    if (folderSearch.trim().length < 2) {
      setFolderOptions(items.filter((item) => item.tipo === "folder"));
      return;
    }
    try {
      const results = await miNubeApi.buscar(folderSearch.trim());
      setFolderOptions(results.filter((item) => item.tipo === "folder"));
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudieron buscar carpetas",
        text: getErrorMessage(err),
      });
    }
  };

  const confirmarMover = async () => {
    if (!moveTarget) return;
    try {
      setWorking(true);
      await miNubeApi.mover(moveTarget.id, moveParentId || null);
      setMoveTarget(null);
      await cargar(currentParentId);
      await Swal.fire({ icon: "success", title: "Elemento movido" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo mover",
        text: getErrorMessage(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const eliminar = async (item: DocumentoNubeItem) => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Eliminar ${item.tipo === "folder" ? "carpeta" : "archivo"}`,
      text:
        item.tipo === "folder"
          ? "Se aplicará borrado lógico también a su contenido."
          : "Se aplicará borrado lógico al archivo.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#9f1d1d",
    });
    if (!result.isConfirmed) return;

    try {
      await miNubeApi.eliminar(item.id);
      await cargar(currentParentId);
      await Swal.fire({ icon: "success", title: "Elemento eliminado" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo eliminar",
        text: getErrorMessage(err),
      });
    }
  };

  return (
    <div className="nautical-panel min-vh-100 py-4">
      <div className="container-fluid px-3 px-lg-4">
        <Card className="card-enmv card-enmv-top-azul">
          <Card.Body>
            <Row className="mb-3">
              <Col>
                <BotonVolver fallbackHref="/candidatos" />
              </Col>
            </Row>

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
              <div>
                <h1 className="section-title">Mi nube</h1>
                <div className="text-muted small">
                  Explorador privado para evaluadores y administradores
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Button
                  variant="outline-primary"
                  onClick={() => setShowFolderModal(true)}
                  disabled={working}
                >
                  Nueva carpeta
                </Button>
                <Button
                  className="btn-dorado"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={working}
                >
                  Subir archivo
                </Button>
                <Form.Control
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) =>
                    void subirArchivos(event as ChangeEvent<HTMLInputElement>)
                  }
                />
              </div>
            </div>

            <Row className="g-3 align-items-center mb-3">
              <Col lg={7}>
                <div className="d-flex flex-wrap gap-2">
                  {trail.map((node, index) => (
                    <Button
                      key={`${node.id ?? "root"}-${index}`}
                      size="sm"
                      variant={
                        index === trail.length - 1
                          ? "primary"
                          : "outline-secondary"
                      }
                      onClick={() => irABreadcrumb(index)}
                    >
                      {node.nombre}
                    </Button>
                  ))}
                </div>
              </Col>
              <Col lg={5}>
                <InputGroup>
                  <Form.Control
                    placeholder="Buscar archivos o carpetas"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void buscar();
                    }}
                  />
                  <Button
                    variant="outline-primary"
                    onClick={() => void buscar()}
                  >
                    Buscar
                  </Button>
                  {isSearching && (
                    <Button
                      variant="outline-secondary"
                      onClick={() => {
                        setSearch("");
                        setSearchResults(null);
                      }}
                    >
                      Limpiar
                    </Button>
                  )}
                </InputGroup>
              </Col>
            </Row>

            {uploadProgress > 0 && (
              <ProgressBar
                animated
                now={uploadProgress}
                label={`${uploadProgress}%`}
                className="mb-3"
              />
            )}

            {error && <Alert variant="danger">{error}</Alert>}

            {loading ? (
              <div className="d-flex justify-content-center py-5">
                <SpinnerTimon size={44} />
              </div>
            ) : visibleItems.length === 0 ? (
              <Alert variant="secondary" className="mb-0">
                {isSearching
                  ? "No se encontraron resultados."
                  : "Esta carpeta está vacía."}
              </Alert>
            ) : (
              <Table responsive hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Tamaño</th>
                    <th>Creación</th>
                    <th>Propietario</th>
                    <th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.tipo === "folder" ? (
                          <Button
                            variant="link"
                            className="p-0 fw-semibold text-decoration-none"
                            onClick={() => entrarCarpeta(item)}
                          >
                            📁 {item.nombre}
                          </Button>
                        ) : (
                          <span className="fw-semibold">📄 {item.nombre}</span>
                        )}
                        {item.extension && (
                          <Badge bg="light" text="dark" className="ms-2">
                            {item.extension}
                          </Badge>
                        )}
                      </td>
                      <td>{item.tipo === "folder" ? "Carpeta" : "Archivo"}</td>
                      <td>
                        {item.tipo === "folder" ? "-" : formatSize(item.size)}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <div>{item.owner?.nombre ?? "-"}</div>
                        <div className="text-muted small">
                          {item.owner?.email ?? ""}
                        </div>
                      </td>
                      <td className="text-end">
                        <ButtonGroup size="sm">
                          {item.tipo === "file" && canPreview(item) && (
                            <Button
                              variant="outline-primary"
                              onClick={() => void ver(item)}
                            >
                              Ver
                            </Button>
                          )}
                          {item.tipo === "file" && (
                            <Button
                              variant="outline-secondary"
                              onClick={() => void descargar(item)}
                            >
                              Descargar
                            </Button>
                          )}
                          <Button
                            variant="outline-secondary"
                            onClick={() => {
                              setRenameTarget(item);
                              setRenameValue(item.nombre);
                            }}
                          >
                            Renombrar
                          </Button>
                          <Button
                            variant="outline-secondary"
                            onClick={() => abrirMover(item)}
                          >
                            Mover
                          </Button>
                          <Button
                            variant="outline-danger"
                            onClick={() => void eliminar(item)}
                          >
                            Eliminar
                          </Button>
                        </ButtonGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      </div>

      <Modal
        show={showFolderModal}
        onHide={() => setShowFolderModal(false)}
        centered
        className="enmv-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Nueva carpeta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Nombre</Form.Label>
          <Form.Control
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            maxLength={200}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowFolderModal(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void crearCarpeta()}
            disabled={!newFolderName.trim() || working}
          >
            Crear
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(renameTarget)}
        onHide={() => setRenameTarget(null)}
        centered
        className="enmv-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Renombrar</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Nombre</Form.Label>
          <Form.Control
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={200}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRenameTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirmarRenombrar()}
            disabled={!renameValue.trim() || working}
          >
            Guardar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(moveTarget)}
        onHide={() => setMoveTarget(null)}
        centered
        className="enmv-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Mover</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="light" className="border">
            Destino para <strong>{moveTarget?.nombre}</strong>
          </Alert>
          <InputGroup className="mb-3">
            <Form.Control
              placeholder="Buscar carpeta destino"
              value={folderSearch}
              onChange={(event) => setFolderSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void buscarCarpetasDestino();
              }}
            />
            <Button
              variant="outline-primary"
              onClick={() => void buscarCarpetasDestino()}
            >
              Buscar
            </Button>
          </InputGroup>
          <Form.Label>Carpeta destino</Form.Label>
          <Form.Select
            value={moveParentId}
            onChange={(event) => setMoveParentId(event.target.value)}
          >
            <option value="">Raíz</option>
            {folderOptions
              .filter((folder) => folder.id !== moveTarget?.id)
              .map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.nombre}
                </option>
              ))}
          </Form.Select>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setMoveTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirmarMover()}
            disabled={working}
          >
            Mover
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
