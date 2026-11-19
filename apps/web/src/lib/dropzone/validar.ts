/**
 * Lógica pura del DropZone (sin DOM): validación de lo que se suelta y
 * contador de dragenter/dragleave. Se prueba con Jest en Node.
 *
 * La validación del navegador solo ahorra un viaje al servidor y da un
 * mensaje claro; la API sigue siendo la que decide (firma de bytes, tamaño).
 */

/** Archivo tal como lo da el navegador (solo lo que se usa; File lo cumple). */
export interface ArchivoSoltado {
  name: string;
  type: string;
  size: number;
}

/** Elemento soltado; `esCarpeta` viene de webkitGetAsEntry() cuando existe. */
export interface EntradaSoltada<T extends ArchivoSoltado = File> {
  archivo: T;
  esCarpeta: boolean;
}

export interface OpcionesValidacion {
  /** Mismo formato que el atributo `accept` del input: ".pdf,image/png,image/*". */
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  /** Cómo nombrar los tipos permitidos en el mensaje ("PDF, JPG o PNG"). */
  etiquetaTipos?: string;
}

export interface ResultadoValidacion<T extends ArchivoSoltado = File> {
  aceptados: T[];
  /** Mensaje para el usuario si se rechazó algo; null si todo pasó. */
  error: string | null;
}

/** Misma regla que el input: extensión (".pdf"), tipo exacto o comodín ("image/*"). */
export function coincideAccept(archivo: ArchivoSoltado, accept?: string): boolean {
  const reglas = (accept ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (reglas.length === 0) return true;
  const nombre = archivo.name.toLowerCase();
  const tipo = archivo.type.toLowerCase();
  return reglas.some((regla) => {
    if (regla.startsWith('.')) return nombre.endsWith(regla);
    if (regla.endsWith('/*')) return tipo.startsWith(regla.slice(0, -1));
    return tipo === regla;
  });
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

function motivoRechazo(
  { archivo, esCarpeta }: EntradaSoltada<ArchivoSoltado>,
  { accept, maxSizeBytes, etiquetaTipos }: OpcionesValidacion,
): string | null {
  if (esCarpeta) return 'No se pueden subir carpetas; suelta archivos.';
  if (archivo.size === 0) return `“${archivo.name}” está vacío.`;
  if (!coincideAccept(archivo, accept)) {
    return etiquetaTipos
      ? `“${archivo.name}” no es un tipo permitido. Se aceptan: ${etiquetaTipos}.`
      : `“${archivo.name}” no es un tipo permitido.`;
  }
  if (maxSizeBytes !== undefined && archivo.size > maxSizeBytes) {
    return `“${archivo.name}” pesa ${formatearBytes(archivo.size)} y el máximo es ${formatearBytes(maxSizeBytes)}.`;
  }
  return null;
}

/**
 * Separa lo que se puede subir de lo que no. Sin `multiple`, soltar más de
 * un elemento se rechaza completo (no se adivina cuál quería el usuario).
 */
export function validarSoltados<T extends ArchivoSoltado>(
  entradas: EntradaSoltada<T>[],
  opciones: OpcionesValidacion,
): ResultadoValidacion<T> {
  if (entradas.length === 0) return { aceptados: [], error: null };
  if (!opciones.multiple && entradas.length > 1) {
    return { aceptados: [], error: 'Suelta un solo archivo a la vez.' };
  }
  const aceptados: T[] = [];
  const motivos: string[] = [];
  for (const entrada of entradas) {
    const motivo = motivoRechazo(entrada, opciones);
    if (motivo) motivos.push(motivo);
    else aceptados.push(entrada.archivo);
  }
  const error =
    motivos.length === 0
      ? null
      : motivos.length === 1
        ? motivos[0]
        : `${motivos[0]} (y ${motivos.length - 1} más no se pudieron subir).`;
  return { aceptados, error };
}

/** True si lo que se arrastra incluye archivos (y no texto, enlaces, etc.). */
export function tieneArchivos(dt: { types?: ArrayLike<string> } | null | undefined): boolean {
  return !!dt?.types && Array.from(dt.types).includes('Files');
}

/**
 * Contador de dragenter/dragleave: el navegador dispara dragenter/dragleave
 * también al pasar sobre cada elemento hijo, así que "arrastrando" solo
 * termina cuando el contador vuelve a 0 (evita el parpadeo).
 */
export function siguienteContador(actual: number, evento: 'enter' | 'leave' | 'reset'): number {
  if (evento === 'enter') return actual + 1;
  if (evento === 'leave') return Math.max(0, actual - 1);
  return 0;
}
