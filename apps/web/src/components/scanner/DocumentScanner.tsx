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
import { DropZone } from '@/components/ui/DropZone';
import { useCapacidadesDispositivo } from '@/hooks/scanner/useCapacidadesDispositivo';
import {
  ACCEPT_IMAGENES,
  ACCEPT_SOLTAR,
  avisoLote,
  clasificarArchivos,
  esHeic,
  MENSAJE_HEIC,
  type ArchivosClasificados,
} from '@/lib/scanner/archivos';
import { camaraEnVivoDisponible } from '@/lib/scanner/camara';
import { CONFIG_ESCANER } from '@/lib/scanner/constantes';
import { esConvexo, rectanguloCompleto } from '@/lib/scanner/geometria';
import { entregarDocumento } from '@/lib/scanner/entrega';
import { decodificarFoto, ErrorImagen, imageDataAJpeg } from '@/lib/scanner/lienzo';
import { toqueTrasEntrarARevision } from '@/lib/scanner/toque-revision';
import type { Cuadrilatero, ModoMejora, Rotacion } from '@/lib/scanner/tipos';
import { CamaraEnVivo } from './CamaraEnVivo';
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

type Paso = 'captura' | 'camara' | 'trabajando' | 'esquinas' | 'revision' | 'generando';

export interface DocumentScannerProps {
  /** Nombre del documento ("INE", "Pasaporte"...): se usa en el título y en el nombre del PDF. */
  etiqueta: string;
  onCerrar: () => void;
  /**
   * Recibe el PDF listo para el flujo de subida existente. El escáner NO se
   * cierra solo: quien lo usa lo cierra (onCerrar) cuando la subida terminó
   * bien. Si la promesa se rechaza, el mensaje del Error se muestra en el
   * escáner y se conservan las páginas y el PDF para reintentar.
   * `alProgreso` (0–100) muestra el avance de la subida.
   */
  onListo: (archivo: File, alProgreso: (porcentaje: number) => void) => void | Promise<void>;
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
  /**
   * Cámara en vivo (getUserMedia) disponible en esta sesión del escáner. Sin
   * HTTPS, sin getUserMedia o con el permiso negado se usa la app de cámara
   * del sistema (<input capture="environment">), que no necesita permiso.
   */
  const [camaraVivo, setCamaraVivo] = useState(camaraEnVivoDisponible);
  const marcarSinCamaraVivo = useCallback(() => setCamaraVivo(false), []);
  /** La foto en ajuste vino de la cámara en vivo: "Repetir" vuelve a ella. */
  const fotoDesdeCamara = useRef(false);
  /**
   * Por capacidades, no por ancho de pantalla: en computadora (mouse, no
   * móvil) el camino principal es subir/arrastrar imágenes y la webcam es
   * opcional; en celular o tableta, la cámara.
   */
  const dispositivo = useCapacidadesDispositivo();
  const escritorio = dispositivo.escritorio;
  /** "Usar webcam" solo si hay getUserMedia y el equipo no informa 0 cámaras. */
  const webcamDisponible = camaraVivo && dispositivo.camaras !== 0;
  /** Aviso no bloqueante (p. ej. imágenes de un lote que no se agregaron). */
  const [aviso, setAviso] = useState<string | null>(null);

  const actual = paginas.find((p) => p.id === seleccionada) ?? null;
  const lleno = paginas.length >= CONFIG_ESCANER.maxPaginas;

  /** Avance de la subida (0–100) mientras `onListo` está en curso; null si no se está subiendo. */
  const [progresoSubida, setProgresoSubida] = useState<number | null>(null);
  /** PDF ya generado cuya subida falló: se reutiliza al reintentar mientras las páginas no cambien. */
  const pdfPendiente = useRef<File | null>(null);

  /** Copia de `paginas` para leer el estado vigente desde callbacks asíncronos. */
  const paginasRef = useRef(paginas);
  useEffect(() => {
    paginasRef.current = paginas;
    pdfPendiente.current = null; // cualquier cambio de páginas invalida el PDF guardado
  }, [paginas]);

  /** Cuándo (performance.now) entró a la revisión: ver toqueTrasEntrarARevision. */
  const entradaRevision = useRef(0);
  useEffect(() => {
    if (paso === 'revision') entradaRevision.current = performance.now();
  }, [paso]);

  /**
   * Vuelve a la captura (repetir una página o agregar otra), salvo un toque
   * rezagado tras "Continuar". Con cámara en vivo se abre directo el visor
   * (desde ahí también se puede elegir de la galería).
   */
  const irACaptura = (paginaAReemplazar: string | null) => {
    if (toqueTrasEntrarARevision(performance.now(), entradaRevision.current)) return;
    setError(null);
    setAviso(null);
    setReemplazar(paginaAReemplazar);
    // En computadora se vuelve a la pantalla de imágenes (desde ahí, la webcam).
    setPaso(camaraVivo && !escritorio ? 'camara' : 'captura');
  };

  /** "Tomar foto": visor en vivo si se puede; si no, la app de cámara del sistema. */
  const tomarFoto = () => {
    setError(null);
    if (camaraVivo) setPaso('camara');
    else inputCamara.current?.click();
  };

  /** Salir del visor sin foto: a las páginas si ya hay, o a la pantalla inicial. */
  const cancelarCamara = () => {
    setReemplazar(null);
    setPaso(paginasRef.current.length > 0 ? 'revision' : 'captura');
  };

  const trabajando = (texto: string) => {
    setError(null);
    setMensaje(texto);
    setPaso('trabajando');
  };

  // ── Captura ────────────────────────────────────────────────────────────

  const alElegirFoto = (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    if (inputCamara.current) inputCamara.current.value = '';
    if (inputGaleria.current) inputGaleria.current.value = '';
    void importar(archivos);
  };

  /**
   * Imágenes elegidas o arrastradas. Una sola sigue el flujo de siempre
   * (ajuste de esquinas); varias se agregan en lote con los bordes
   * detectados y se revisan después. Los PDF no se escanean.
   */
  const importar = async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setError(null);
    setAviso(null);
    const max = CONFIG_ESCANER.maxPaginas;
    // "Repetir" una página: solo cuenta la primera imagen.
    const espacio = reemplazar ? 1 : max - paginasRef.current.length;
    const c = clasificarArchivos(archivos, espacio, CONFIG_ESCANER.maxBytesImagen);
    const resto = { ...c, sobrantes: reemplazar ? 0 : c.sobrantes };
    if (c.imagenes.length === 0) {
      setError(avisoLote(resto, 0, max) ?? 'Elige una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }
    if (c.imagenes.length === 1) {
      await procesarFoto(c.imagenes[0], false);
      setAviso(avisoLote(resto, 0, max));
      return;
    }
    await importarLote(c.imagenes, resto);
  };

  const importarLote = async (imagenes: File[], c: Omit<ArchivosClasificados<File>, 'imagenes'>) => {
    const nuevas: Pagina[] = [];
    let fallidas = 0;
    let heicFallida = false;
    const modo = CONFIG_ESCANER.modoPorDefecto;
    for (let i = 0; i < imagenes.length; i++) {
      trabajando(`Procesando imagen ${i + 1} de ${imagenes.length}…`);
      try {
        const foto = await decodificarFoto(imagenes[i], CONFIG_ESCANER.ladoMaxEntrada);
        const original = await imageDataAJpeg(foto, CALIDAD_ORIGINAL);
        const deteccion = await detectar(foto);
        // Sin bordes claros, la imagen completa: el rectángulo de respaldo recortaría el documento.
        const esquinas = deteccion.respaldo ? rectanguloCompleto(foto.width, foto.height) : deteccion.esquinas;
        const resultado = await procesar(esquinas, modo, 0);
        if (!resultado) throw new Error('procesamiento reemplazado');
        const id = nuevoId();
        cargada.current = id;
        nuevas.push({
          id,
          original,
          urlOriginal: urls.crear(original),
          anchoOriginal: foto.width,
          altoOriginal: foto.height,
          esquinas,
          modo,
          rotacion: 0,
          resultado,
          urlResultado: urls.crear(resultado.jpeg),
        });
      } catch {
        fallidas++;
        if (esHeic(imagenes[i])) heicFallida = true;
      }
    }
    const texto = [avisoLote(c, fallidas, CONFIG_ESCANER.maxPaginas), heicFallida ? MENSAJE_HEIC : null]
      .filter(Boolean)
      .join(' ');
    if (nuevas.length === 0) {
      setPaso(paginasRef.current.length > 0 ? 'revision' : 'captura');
      setError(texto || 'No se pudo leer ninguna imagen.');
      return;
    }
    setPaginas((ps) => [...ps, ...nuevas]);
    setSeleccionada(nuevas[0].id);
    setPaso('revision');
    setAviso(
      `Se agregaron ${nuevas.length} páginas con los bordes detectados: revisa cada una (toca la miniatura y “Ajustar esquinas” si hace falta).` +
        (texto ? ` ${texto}` : ''),
    );
  };

  /** Foto (cámara en vivo, app de cámara o galería) → bordes → ajuste de esquinas. */
  const procesarFoto = async (archivo: Blob, desdeCamara: boolean) => {
    fotoDesdeCamara.current = desdeCamara;
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
        archivo instanceof File && esHeic(archivo)
          ? MENSAJE_HEIC
          : err instanceof ErrorImagen
            ? err.message
            : 'No se pudo procesar la foto. Intenta tomarla de nuevo.',
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
    setPaso(fotoDesdeCamara.current && camaraVivo ? 'camara' : 'captura');
  };

  /** `talCual`: imagen completa y sin mejora (se puede cambiar después en la revisión). */
  const confirmarEsquinas = async (talCual = false) => {
    if (!edicion) return;
    const existente = paginas.find((p) => p.id === edicion.paginaId) ?? null;
    const modo: ModoMejora = talCual ? 'original' : (existente?.modo ?? CONFIG_ESCANER.modoPorDefecto);
    const esquinas = talCual ? rectanguloCompleto(edicion.ancho, edicion.alto) : edicion.esquinas;
    // Foto nueva = sin rotación; mismas esquinas de una página existente = conserva la rotación.
    const rotacion: Rotacion = edicion.fotoNueva ? 0 : (existente?.rotacion ?? 0);
    trabajando('Enderezando y mejorando…');
    try {
      const resultado = await procesar(esquinas, modo, rotacion);
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
        esquinas,
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
    const resultado = await entregarDocumento<File>({
      existente: pdfPendiente.current,
      generar: () =>
        generar(
          paginas.map((p) => p.resultado),
          etiqueta,
        ),
      entregar: async (archivo) => {
        pdfPendiente.current = archivo;
        setProgresoSubida(0);
        await onListo(archivo, setProgresoSubida);
      },
    });
    setProgresoSubida(null);
    if (resultado.ok) {
      pdfPendiente.current = null;
      return; // quien usa el escáner lo cierra al terminar
    }
    // Falló la generación del PDF o la subida (el mensaje las distingue): se vuelve a la revisión.
    if (resultado.fase === 'pdf') pdfPendiente.current = null;
    setPaso('revision');
    setError(resultado.mensaje);
  };

  const cerrar = async () => {
    // Mientras se genera o se sube el PDF no se puede salir: se perdería el escaneo.
    if (paso === 'generando') return;
    if (paginas.length > 0) {
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
    <Modal
      show
      // Celular/tableta: siempre pantalla completa (también en horizontal). Computadora: modal amplio.
      fullscreen={escritorio ? 'md-down' : true}
      size={escritorio ? 'xl' : 'lg'}
      onHide={() => void cerrar()}
      backdrop="static"
      aria-labelledby="titulo-escaner"
    >
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
          onChange={(e) => alElegirFoto(e.target.files)}
        />
        <input
          ref={inputGaleria}
          type="file"
          accept={ACCEPT_IMAGENES}
          multiple
          className="d-none"
          onChange={(e) => alElegirFoto(e.target.files)}
        />

        {/* Arrastrar y soltar imágenes (computadora). Solo en la pantalla inicial y en la revisión. */}
        <DropZone
          onFiles={(archivos) => void importar(archivos)}
          accept={ACCEPT_SOLTAR}
          etiquetaTipos="JPG, PNG, WEBP o HEIC"
          maxSizeBytes={CONFIG_ESCANER.maxBytesImagen}
          multiple
          disabled={!(paso === 'captura' || paso === 'revision') || procesando || (lleno && !reemplazar)}
          textoSoltar="Suelta las imágenes para agregarlas como páginas"
        >
          {error && (
            <Alert variant="danger" className="py-2 small" onClose={() => setError(null)} dismissible>
              {error}
            </Alert>
          )}
          {aviso && !error && (
            <Alert variant="warning" className="py-2 small" onClose={() => setAviso(null)} dismissible>
              {aviso}
            </Alert>
          )}

          {paso === 'captura' && (
            <div className={escritorio ? estilos.capturaAncha : estilos.captura}>
              {escritorio ? (
                <div className="d-grid gap-3">
                  <button type="button" className={estilos.zonaImagenes} onClick={() => inputGaleria.current?.click()}>
                    <i className="bi bi-images" aria-hidden="true" />
                    <span className="fw-semibold">Arrastra aquí las fotos del documento</span>
                    <span className="small text-muted">
                      o haz clic para elegirlas · JPG, PNG, WEBP o HEIC · puedes elegir varias (una por página)
                    </span>
                  </button>
                  {webcamDisponible && (
                    <Button
                      size="lg"
                      variant="outline-primary"
                      className={estilos.botonGrande}
                      onClick={() => {
                        setError(null);
                        setAviso(null);
                        setPaso('camara');
                      }}
                    >
                      <i className="bi bi-webcam me-2" aria-hidden="true" />
                      Usar webcam
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <ul className={estilos.consejos}>
                    <li><i className="bi bi-square" aria-hidden="true" /> Pon el documento sobre una superficie lisa y oscura.</li>
                    <li><i className="bi bi-brightness-high" aria-hidden="true" /> Buena luz y sin flash directo (evita reflejos).</li>
                    <li><i className="bi bi-bounding-box-circles" aria-hidden="true" /> Que se vean las 4 esquinas.</li>
                  </ul>
                  <div className="d-grid gap-2">
                    <Button size="lg" variant="primary" className={estilos.botonGrande} onClick={tomarFoto}>
                      <i className="bi bi-camera-fill me-2" aria-hidden="true" />
                      Tomar foto
                    </Button>
                    <Button size="lg" variant="outline-primary" className={estilos.botonGrande} onClick={() => inputGaleria.current?.click()}>
                      <i className="bi bi-images me-2" aria-hidden="true" />
                      Elegir de la galería
                    </Button>
                  </div>
                </>
              )}
              {paginas.length > 0 && (
                <div className="d-grid mt-2">
                  <Button variant="link" onClick={() => { setReemplazar(null); setPaso('revision'); }}>
                    Volver a las páginas
                  </Button>
                </div>
              )}
            </div>
          )}

          {paso === 'camara' && (
            <CamaraEnVivo
              escritorio={escritorio}
              onCaptura={(foto) => void procesarFoto(foto, true)}
              onCancelar={cancelarCamara}
              onUsarAppCamara={() => inputCamara.current?.click()}
              onGaleria={() => inputGaleria.current?.click()}
              onNoDisponible={marcarSinCamaraVivo}
            />
          )}

          {paso === 'trabajando' && <Ocupado mensaje={mensaje} />}

          {paso === 'esquinas' && edicion && (
            <>
              <p className={`small mb-2 ${edicion.respaldo ? 'text-danger fw-semibold' : 'text-muted'}`} role="status">
                {edicion.respaldo
                  ? 'No encontramos los bordes. Arrastra los 4 puntos a las esquinas del documento, o usa la imagen tal cual.'
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
            <div className={escritorio ? estilos.revisionAncha : undefined}>
              <div className={estilos.vista}>
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, no aplica next/image */}
                <img src={actual.urlResultado} alt={`Vista previa de la página ${paginas.indexOf(actual) + 1}`} />
                {procesando && (
                  <div className={estilos.velo}>
                    <Spinner animation="border" variant="light" />
                  </div>
                )}
              </div>
              <div>
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
                    {escritorio && !lleno && (
                      <p className="small text-muted text-center mb-0">
                        <i className="bi bi-download me-1" aria-hidden="true" />
                        Arrastra más imágenes aquí para agregarlas.
                      </p>
                    )}
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
                    <div className="small text-muted mb-1">
                      {progresoSubida !== null ? 'Subiendo el documento…' : (progreso?.mensaje ?? 'Generando PDF…')}
                    </div>
                    <ProgressBar now={progresoSubida ?? progreso?.porcentaje ?? 5} animated />
                  </div>
                )}
              </div>
            </div>
          )}
        </DropZone>
      </Modal.Body>

      {paso === 'esquinas' && edicion && (
        <Modal.Footer className={estilos.acciones}>
          <Button size="lg" variant="outline-secondary" onClick={edicion.fotoNueva ? repetirFoto : () => { descartarEdicion(); setPaso('revision'); }}>
            <i className={`bi ${edicion.fotoNueva ? 'bi-arrow-counterclockwise' : 'bi-x-lg'} me-1`} aria-hidden="true" />
            {edicion.fotoNueva ? 'Repetir' : 'Cancelar'}
          </Button>
          <Button
            size="lg"
            variant="outline-primary"
            title="Imagen completa, sin recorte ni mejora (puedes cambiarlo después)"
            onClick={() => void confirmarEsquinas(true)}
          >
            <i className="bi bi-image me-1" aria-hidden="true" /> Usar tal cual
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
