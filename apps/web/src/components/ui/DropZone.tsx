'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  siguienteContador,
  tieneArchivos,
  validarSoltados,
  type EntradaSoltada,
} from '@/lib/dropzone/validar';
import estilos from './DropZone.module.css';

export interface DropZoneProps {
  /** Recibe solo archivos que pasaron la validación; el flujo de subida es el de siempre. */
  onFiles: (archivos: File[]) => void | Promise<void>;
  /** Mismo formato que el atributo accept del input. */
  accept?: string;
  /** Cómo nombrar los tipos permitidos en el mensaje de error ("PDF, JPG o PNG"). */
  etiquetaTipos?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Hay una subida en curso: se ignoran los archivos soltados. */
  loading?: boolean;
  /**
   * true: la zona es el control de subida (caja punteada, clic y Enter/Espacio
   * abren el selector). false: envuelve contenido que ya tiene sus propios
   * botones (subir, escanear) y solo añade el soltar con una capa al arrastrar.
   */
  seleccionable?: boolean;
  /** Texto de la capa al arrastrar y del aviso para lector de pantalla. */
  textoSoltar?: string;
  /**
   * Solo con seleccionable=false. 'zona': la capa cubre el contenido (tarjetas
   * chicas). 'pantalla': cubre la ventana visible (páginas largas, donde el
   * centro del contenido puede quedar fuera de la vista).
   */
  capa?: 'zona' | 'pantalla';
  className?: string;
  children: ReactNode;
}

/** Elementos dentro de la zona que atienden su propio clic (no abren el selector). */
const INTERACTIVOS = 'a,button,input,select,textarea,label';

/**
 * React propaga los eventos de un portal (p. ej. el modal del escáner) a sus
 * ancestros de React aunque en el DOM estén fuera: solo cuenta lo que ocurre
 * dentro de la zona.
 */
const dentro = (e: SyntheticEvent<HTMLElement>) => e.currentTarget.contains(e.target as Node);

/** Lee lo soltado de forma síncrona (después de un await el navegador lo vacía). */
function leerEntradas(dt: DataTransfer): EntradaSoltada[] {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file');
  if (items.length > 0) {
    return items.flatMap((item) => {
      const archivo = item.getAsFile();
      if (!archivo) return [];
      const esCarpeta = item.webkitGetAsEntry?.()?.isDirectory ?? false;
      return [{ archivo, esCarpeta }];
    });
  }
  return Array.from(dt.files ?? []).map((archivo) => ({ archivo, esCarpeta: false }));
}

export function DropZone({
  onFiles,
  accept,
  etiquetaTipos,
  maxSizeBytes,
  multiple = false,
  disabled = false,
  loading = false,
  seleccionable = false,
  textoSoltar,
  capa = 'zona',
  className,
  children,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const contador = useRef(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bloqueada = disabled || loading;
  const aviso = textoSoltar ?? (multiple ? 'Suelta los archivos para subirlos' : 'Suelta el archivo para subirlo');

  // Si el navegador pierde un dragleave (un hijo que se desmonta a media
  // arrastre), el soltar fuera o cancelar con Esc también reinicia el estado.
  useEffect(() => {
    const reiniciar = () => {
      contador.current = siguienteContador(contador.current, 'reset');
      setArrastrando(false);
    };
    window.addEventListener('drop', reiniciar);
    window.addEventListener('dragend', reiniciar);
    return () => {
      window.removeEventListener('drop', reiniciar);
      window.removeEventListener('dragend', reiniciar);
    };
  }, []);

  const entregar = (entradas: EntradaSoltada[]) => {
    const { aceptados, error: mensaje } = validarSoltados(entradas, { accept, maxSizeBytes, multiple, etiquetaTipos });
    setError(mensaje);
    if (aceptados.length > 0) void onFiles(aceptados);
  };

  const alEntrar = (e: DragEvent<HTMLDivElement>) => {
    if (!dentro(e) || !tieneArchivos(e.dataTransfer)) return;
    e.preventDefault();
    contador.current = siguienteContador(contador.current, 'enter');
    setArrastrando(true);
    setError(null);
  };

  const alSalir = (e: DragEvent<HTMLDivElement>) => {
    if (!dentro(e) || !tieneArchivos(e.dataTransfer)) return;
    contador.current = siguienteContador(contador.current, 'leave');
    if (contador.current === 0) setArrastrando(false);
  };

  const alSobrevolar = (e: DragEvent<HTMLDivElement>) => {
    if (!dentro(e) || !tieneArchivos(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = bloqueada ? 'none' : 'copy';
  };

  const alSoltar = (e: DragEvent<HTMLDivElement>) => {
    if (!dentro(e) || !tieneArchivos(e.dataTransfer)) return;
    e.preventDefault();
    contador.current = siguienteContador(contador.current, 'reset');
    setArrastrando(false);
    if (disabled) return;
    if (loading) {
      setError('Espera a que termine la subida actual.');
      return;
    }
    entregar(leerEntradas(e.dataTransfer));
  };

  const abrirSelector = () => {
    if (!bloqueada) inputRef.current?.click();
  };

  const alHacerClic = (e: MouseEvent<HTMLDivElement>) => {
    if (!seleccionable || !dentro(e)) return;
    const destino = e.target as HTMLElement;
    if (destino !== e.currentTarget && destino.closest(INTERACTIVOS)) return;
    abrirSelector();
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!seleccionable || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      abrirSelector();
    }
  };

  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (archivos.length > 0) entregar(archivos.map((archivo) => ({ archivo, esCarpeta: false })));
  };

  const clases = [
    seleccionable ? estilos.caja : estilos.superficie,
    arrastrando && !bloqueada ? estilos.arrastrando : '',
    error ? estilos.conError : '',
    loading ? estilos.cargando : '',
    disabled ? estilos.deshabilitada : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const mensajeError = error && (
    <div role="alert" className={estilos.error}>
      <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
      {error}
    </div>
  );

  return (
    <div
      data-dropzone=""
      className={clases}
      onDragEnter={alEntrar}
      onDragLeave={alSalir}
      onDragOver={alSobrevolar}
      onDrop={alSoltar}
      onClick={alHacerClic}
      onKeyDown={alTeclear}
      {...(seleccionable
        ? { role: 'button', tabIndex: bloqueada ? -1 : 0, 'aria-disabled': bloqueada || undefined }
        : {})}
      aria-busy={loading || undefined}
    >
      {seleccionable && (
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onChange={alElegir}
        />
      )}
      {!seleccionable && mensajeError}
      {children}
      {seleccionable && mensajeError}
      {!seleccionable && arrastrando && !bloqueada && (
        <div className={`${estilos.velo} ${capa === 'pantalla' ? estilos.pantalla : ''}`} aria-hidden="true">
          <i className="bi bi-cloud-arrow-up me-2" />
          {aviso}
        </div>
      )}
      <span className="visually-hidden" aria-live="polite">
        {arrastrando && !bloqueada ? aviso : ''}
      </span>
    </div>
  );
}
