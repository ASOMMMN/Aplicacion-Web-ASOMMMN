'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';
import Swal from 'sweetalert2';
import { useClienteEscaner } from '@/hooks/scanner/useClienteEscaner';
import { useDeteccionBordes } from '@/hooks/scanner/useDeteccionBordes';
import { useDiagnosticoEscaner } from '@/hooks/scanner/useDiagnosticoEscaner';
import { useGeneradorPdf } from '@/hooks/scanner/useGeneradorPdf';
import { useMejoraImagen, type PaginaProcesada } from '@/hooks/scanner/useMejoraImagen';
import { useUrlsObjeto } from '@/hooks/scanner/useUrlsObjeto';
import { CONFIG_ESCANER } from '@/lib/scanner/constantes';
import { esConvexo } from '@/lib/scanner/geometria';
import { decodificarFoto, ErrorImagen, imageDataAJpeg } from '@/lib/scanner/lienzo';
import { toqueTrasEntrarARevision } from '@/lib/scanner/toque-revision';
import type { Cuadrilatero, ModoMejora, Rotacion } from '@/lib/scanner/tipos';
import { EditorEsquinas } from './EditorEsquinas';
import { ListaPaginas } from './ListaPaginas';
import { SelectorModo } from './SelectorModo';
import estilos from './escaner.module.css';

/** Calidad con la que se guarda la foto reducida para volver a ajustar las esquinas. */
const CALIDAD_ORIGINAL = 0.92;

interface Pagina {
  id: string;
  original: Blob;
  urlOriginal: string;
  anchoOriginal: number;
  altoOriginal: number;
  esquinas: Cuadrilatero;
  modo: ModoMejora;
  rotacion: Rotacion;
  resultado: PaginaProcesada;
  urlResultado: string;
}

/** Foto en ajuste de esquinas: nueva (`paginaId` null) o de una página existente. */
interface Edicion {
  paginaId: string | null;
  original: Blob;
  urlOriginal: string;
  ancho: number;
  alto: number;
  esquinas: Cuadrilatero;
  respaldo: boolean;
  /** true si la foto es nueva (tomada ahora) y hay que descartarla al cancelar. */
  fotoNueva: boolean;
}

type Paso = 'captura' | 'trabajando' | 'esquinas' | 'revision' | 'generando';

export interface DocumentScannerProps {
  /** Nombre del documento ("INE", "Pasaporte"...): se usa en el título y en el nombre del PDF. */
  etiqueta: string;
  onCerrar: () => void;
  /** Recibe el PDF listo para el flujo de subida existente. */
  onListo: (archivo: File) => void | Promise<void>;
}

let contadorIds = 0;
const nuevoId = () => `p${Date.now().toString(36)}${(contadorIds++).toString(36)}`;

/**
 * Escáner de documentos: foto (cámara o galería) → bordes (automático o a
 * mano) → enderezado y mejora → varias páginas → PDF. Todo ocurre en el
 * dispositivo; al cerrarse termina el worker y revoca las URLs blob:.
 */
export default function DocumentScanner({ etiqueta, onCerrar, onListo }: DocumentScannerProps) {
  const cliente = useClienteEscaner();
  const { detectar } = useDeteccionBordes(cliente);
  const { procesar, procesando } = useMejoraImagen(cliente);
  const { generar, progreso } = useGeneradorPdf(cliente);
  const urls = useUrlsObjeto();

  const inputCamara = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<Paso>('captura');
  useDiagnosticoEscaner(paso); // TEMPORAL: ver hooks/scanner/useDiagnosticoEscaner.ts
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  /** Página que va a reemplazar la próxima foto ("Repetir"); null = página nueva. */
  const [reemplazar, setReemplazar] = useState<string | null>(null);
  /** Qué foto está cargada en el procesador (para no volver a cargarla). */
  const cargada = useRef<string | null>(null);

  const actual = paginas.find((p) => p.id === seleccionada) ?? null;
  const lleno = paginas.length >= CONFIG_ESCANER.maxPaginas;

  /** Copia de `paginas` para leer el estado vigente desde callbacks asíncronos. */
  const paginasRef = useRef(paginas);
  useEffect(() => {
    paginasRef.current = paginas;
  }, [paginas]);

  /** Cuándo (performance.now) entró a la revisión: ver toqueTrasEntrarARevision. */
  const entradaRevision = useRef(0);
  useEffect(() => {
    if (paso === 'revision') entradaRevision.current = performance.now();
  }, [paso]);

  /** Vuelve a la captura (repetir una página o agregar otra), salvo un toque rezagado tras "Continuar". */
  const irACaptura = (paginaAReemplazar: string | null) => {
    if (toqueTrasEntrarARevision(performance.now(), entradaRevision.current)) return;
    setReemplazar(paginaAReemplazar);
    setPaso('captura');
  };

  const trabajando = (texto: string) => {
    setError(null);
    setMensaje(texto);
    setPaso('trabajando');
  };

  // ── Captura ────────────────────────────────────────────────────────────

  const alElegirFoto = async (archivos: FileList | null) => {
    const archivo = archivos?.[0];
    if (inputCamara.current) inputCamara.current.value = '';
    if (inputGaleria.current) inputGaleria.current.value = '';
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith('image/') && archivo.type !== '') {
      setError('Elige una foto (JPG o PNG). Para subir un PDF usa “Subir archivo”.');
      return;
    }
    try {
      trabajando('Leyendo la foto…');
      const foto = await decodificarFoto(archivo, CONFIG_ESCANER.ladoMaxEntrada);
      const original = await imageDataAJpeg(foto, CALIDAD_ORIGINAL);
      trabajando('Buscando los bordes del documento…');
      const deteccion = await detectar(foto);
      cargada.current = 'edicion';
      setEdicion({
        paginaId: reemplazar,
        original,
        urlOriginal: urls.crear(original),
        ancho: foto.width,
        alto: foto.height,
        esquinas: deteccion.esquinas,
        respaldo: deteccion.respaldo,
        fotoNueva: true,
      });
      setPaso('esquinas');
    } catch (err) {
      setPaso('captura');
      setError(
        err instanceof ErrorImagen ? err.message : 'No se pudo procesar la foto. Intenta tomarla de nuevo.',
      );
    }
  };

  // ── Esquinas ───────────────────────────────────────────────────────────

  const descartarEdicion = () => {
    if (edicion?.fotoNueva) urls.revocar(edicion.urlOriginal);
    setEdicion(null);
  };

  const repetirFoto = () => {
    descartarEdicion();
    setPaso('captura');
  };

  const confirmarEsquinas = async () => {
    if (!edicion) return;
    const existente = paginas.find((p) => p.id === edicion.paginaId) ?? null;
    const modo = existente?.modo ?? CONFIG_ESCANER.modoPorDefecto;
    // Foto nueva = sin rotación; mismas esquinas de una página existente = conserva la rotación.
    const rotacion: Rotacion = edicion.fotoNueva ? 0 : (existente?.rotacion ?? 0);
    trabajando('Enderezando y mejorando…');
    try {
      const resultado = await procesar(edicion.esquinas, modo, rotacion);
      if (!resultado) {
        setPaso('esquinas');
        return;
      }
      const urlResultado = urls.crear(resultado.jpeg);
      const id = existente?.id ?? nuevoId();
      if (existente) {
        urls.revocar(existente.urlResultado);
        if (edicion.fotoNueva) urls.revocar(existente.urlOriginal);
      }
      cargada.current = id;
      const pagina: Pagina = {
        id,
        original: edicion.original,
        urlOriginal: edicion.urlOriginal,
        anchoOriginal: edicion.ancho,
        altoOriginal: edicion.alto,
        esquinas: edicion.esquinas,
        modo,
        rotacion,
        resultado,
        urlResultado,
      };
      setPaginas((ps) => (existente ? ps.map((p) => (p.id === id ? pagina : p)) : [...ps, pagina]));
      setSeleccionada(id);
      setEdicion(null);
      setReemplazar(null);
      setPaso('revision');
    } catch {
      setPaso('esquinas');
      setError('No se pudo enderezar la foto. Revisa las esquinas o repite la toma.');
    }
  };

  // ── Revisión ───────────────────────────────────────────────────────────

  /** Carga en el procesador la foto de una página guardada (si no es la cargada). */
  const asegurarCargada = useCallback(
    async (p: Pagina) => {
      if (cargada.current === p.id) return;
      const foto = await decodificarFoto(p.original, CONFIG_ESCANER.ladoMaxEntrada);
      await cliente().cargar(foto);
      cargada.current = p.id;
    },
    [cliente],
  );

  const reprocesar = async (p: Pagina, cambios: Partial<Pick<Pagina, 'modo' | 'rotacion'>>) => {
    const modo = cambios.modo ?? p.modo;
    const rotacion = cambios.rotacion ?? p.rotacion;
    setError(null);
    // Se refleja la elección de inmediato; la imagen llega al terminar.
    setPaginas((ps) => ps.map((q) => (q.id === p.id ? { ...q, modo, rotacion } : q)));
    try {
      await asegurarCargada(p);
      const resultado = await procesar(p.esquinas, modo, rotacion);
      if (!resultado) return;
      const vigente = paginasRef.current.find((q) => q.id === p.id);
      if (!vigente) return; // se eliminó mientras se procesaba
      urls.revocar(vigente.urlResultado);
      const urlResultado = urls.crear(resultado.jpeg);
      setPaginas((ps) =>
        ps.map((q) => (q.id === p.id ? { ...q, modo, rotacion, resultado, urlResultado } : q)),
      );
    } catch {
      setPaginas((ps) => ps.map((q) => (q.id === p.id ? { ...q, modo: p.modo, rotacion: p.rotacion } : q)));
      setError('No se pudo aplicar el cambio. Intenta de nuevo.');
    }
  };

  const ajustarEsquinas = async (p: Pagina) => {
    trabajando('Preparando…');
    try {
      await asegurarCargada(p);
      setEdicion({
        paginaId: p.id,
        original: p.original,
        urlOriginal: p.urlOriginal,
        ancho: p.anchoOriginal,
        alto: p.altoOriginal,
        esquinas: p.esquinas,
        respaldo: false,
        fotoNueva: false,
      });
      setPaso('esquinas');
    } catch {
      setPaso('revision');
      setError('No se pudo abrir la foto original.');
    }
  };

  const eliminar = (id: string) => {
    const p = paginas.find((q) => q.id === id);
    if (!p) return;
    urls.revocar(p.urlOriginal);
    urls.revocar(p.urlResultado);
    const restantes = paginas.filter((q) => q.id !== id);
    setPaginas(restantes);
    if (seleccionada === id) setSeleccionada(restantes[restantes.length - 1]?.id ?? null);
    if (restantes.length === 0) setPaso('captura');
    if (cargada.current === id) cargada.current = null;
  };

  const mover = (id: string, dir: -1 | 1) =>
    setPaginas((ps) => {
      const i = ps.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ps.length) return ps;
      const copia = [...ps];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const usarDocumento = async () => {
    if (paginas.length === 0) return;
    setError(null);
    setPaso('generando');
    try {
      const archivo = await generar(
        paginas.map((p) => p.resultado),
        etiqueta,
      );
      await onListo(archivo);
    } catch {
      setPaso('revision');
      setError('No se pudo generar el PDF. Intenta de nuevo.');
    }
  };

  const cerrar = async () => {
    if (paginas.length > 0 && paso !== 'generando') {
      const r = await Swal.fire({
        icon: 'question',
        title: '¿Descartar el escaneo?',
        text: 'Se perderán las páginas escaneadas.',
        showCancelButton: true,
        confirmButtonText: 'Sí, descartar',
        cancelButtonText: 'Seguir escaneando',
      });
      if (!r.isConfirmed) return;
    }
    onCerrar();
  };

  const ocupado = procesando || paso === 'generando' || paso === 'trabajando';
  const esquinasValidas = edicion ? esConvexo(edicion.esquinas) : false;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Modal show fullscreen="md-down" size="lg" onHide={() => void cerrar()} backdrop="static" aria-labelledby="titulo-escaner">
      <Modal.Header closeButton={!ocupado}>
        <Modal.Title as="h6" id="titulo-escaner">
          <i className="bi bi-camera me-2" aria-hidden="true" />
          Escanear: {etiqueta}
          {paginas.length > 0 && (
            <span className="text-muted fw-normal ms-2">
              ({paginas.length} {paginas.length === 1 ? 'página' : 'páginas'})
            </span>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={estilos.cuerpo}>
        <input
          ref={inputCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="d-none"
          onChange={(e) => void alElegirFoto(e.target.files)}
        />
        <input
          ref={inputGaleria}
          type="file"
          accept="image/*"
          className="d-none"
          onChange={(e) => void alElegirFoto(e.target.files)}
        />

        {error && (
          <Alert variant="danger" className="py-2 small" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {paso === 'captura' && (
          <div className={estilos.captura}>
            <ul className={estilos.consejos}>
              <li><i className="bi bi-square" aria-hidden="true" /> Pon el documento sobre una superficie lisa y oscura.</li>
              <li><i className="bi bi-brightness-high" aria-hidden="true" /> Buena luz y sin flash directo (evita reflejos).</li>
              <li><i className="bi bi-bounding-box-circles" aria-hidden="true" /> Que se vean las 4 esquinas.</li>
            </ul>
            <div className="d-grid gap-2">
              <Button size="lg" variant="primary" className={estilos.botonGrande} onClick={() => inputCamara.current?.click()}>
                <i className="bi bi-camera-fill me-2" aria-hidden="true" />
                Tomar foto
              </Button>
              <Button size="lg" variant="outline-primary" className={estilos.botonGrande} onClick={() => inputGaleria.current?.click()}>
                <i className="bi bi-images me-2" aria-hidden="true" />
                Elegir de la galería
              </Button>
              {paginas.length > 0 && (
                <Button variant="link" onClick={() => { setReemplazar(null); setPaso('revision'); }}>
                  Volver a las páginas
                </Button>
              )}
            </div>
          </div>
        )}

        {paso === 'trabajando' && <Ocupado mensaje={mensaje} />}

        {paso === 'esquinas' && edicion && (
          <>
            <p className={`small mb-2 ${edicion.respaldo ? 'text-danger fw-semibold' : 'text-muted'}`} role="status">
              {edicion.respaldo
                ? 'No encontramos los bordes. Arrastra los 4 puntos a las esquinas del documento.'
                : 'Revisa que los 4 puntos estén en las esquinas del documento; arrástralos si hace falta.'}
            </p>
            <EditorEsquinas
              url={edicion.urlOriginal}
              ancho={edicion.ancho}
              alto={edicion.alto}
              esquinas={edicion.esquinas}
              onChange={(esquinas) => setEdicion({ ...edicion, esquinas, respaldo: false })}
            />
            {!esquinasValidas && (
              <p className="small text-danger mt-2 mb-0">Las esquinas se cruzan: acomódalas en orden alrededor del documento.</p>
            )}
          </>
        )}

        {(paso === 'revision' || paso === 'generando') && actual && (
          <>
            <div className={estilos.vista}>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, no aplica next/image */}
              <img src={actual.urlResultado} alt={`Vista previa de la página ${paginas.indexOf(actual) + 1}`} />
              {procesando && (
                <div className={estilos.velo}>
                  <Spinner animation="border" variant="light" />
                </div>
              )}
            </div>
            {paso === 'revision' && (
              <>
                <SelectorModo modo={actual.modo} deshabilitado={procesando} onChange={(modo) => void reprocesar(actual, { modo })} />
                <div className={estilos.herramientas}>
                  <Button
                    variant="outline-secondary"
                    disabled={procesando}
                    onClick={() => void reprocesar(actual, { rotacion: ((actual.rotacion + 90) % 360) as Rotacion })}
                  >
                    <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" /> Girar
                  </Button>
                  <Button variant="outline-secondary" disabled={procesando} onClick={() => void ajustarEsquinas(actual)}>
                    <i className="bi bi-bounding-box me-1" aria-hidden="true" /> Ajustar esquinas
                  </Button>
                </div>
              </>
            )}
            {paginas.length > 1 && (
              <ListaPaginas
                paginas={paginas.map((p) => ({ id: p.id, url: p.urlResultado }))}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                onMover={mover}
                onEliminar={eliminar}
                deshabilitado={ocupado}
              />
            )}
            {paso === 'generando' && (
              <div className="mt-3" role="status" aria-live="polite">
                <div className="small text-muted mb-1">{progreso?.mensaje ?? 'Generando PDF…'}</div>
                <ProgressBar now={progreso?.porcentaje ?? 5} animated />
              </div>
            )}
          </>
        )}
      </Modal.Body>

      {paso === 'esquinas' && edicion && (
        <Modal.Footer className={estilos.acciones}>
          <Button size="lg" variant="outline-secondary" onClick={edicion.fotoNueva ? repetirFoto : () => { descartarEdicion(); setPaso('revision'); }}>
            <i className={`bi ${edicion.fotoNueva ? 'bi-arrow-counterclockwise' : 'bi-x-lg'} me-1`} aria-hidden="true" />
            {edicion.fotoNueva ? 'Repetir' : 'Cancelar'}
          </Button>
          <Button size="lg" variant="primary" disabled={!esquinasValidas} onClick={() => void confirmarEsquinas()}>
            <i className="bi bi-check-lg me-1" aria-hidden="true" /> Continuar
          </Button>
        </Modal.Footer>
      )}

      {(paso === 'revision' || paso === 'generando') && actual && (
        <Modal.Footer className={estilos.acciones}>
          <Button
            size="lg"
            variant="outline-secondary"
            disabled={ocupado}
            onClick={() => irACaptura(actual.id)}
          >
            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" /> Repetir
          </Button>
          <Button
            size="lg"
            variant="outline-primary"
            disabled={ocupado || lleno}
            title={lleno ? `Máximo ${CONFIG_ESCANER.maxPaginas} páginas` : undefined}
            onClick={() => irACaptura(null)}
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" /> Agregar página
          </Button>
          <Button size="lg" variant="dorado" disabled={ocupado} onClick={() => void usarDocumento()}>
            {paso === 'generando' ? (
              <Spinner animation="border" size="sm" className="me-2" />
            ) : (
              <i className="bi bi-check2-circle me-1" aria-hidden="true" />
            )}
            Usar este documento
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

function Ocupado({ mensaje }: { mensaje: string }) {
  return (
    <div className="text-center py-5" role="status" aria-live="polite">
      <Spinner animation="border" variant="primary" />
      <div className="mt-3 text-muted">{mensaje}</div>
    </div>
  );
}
