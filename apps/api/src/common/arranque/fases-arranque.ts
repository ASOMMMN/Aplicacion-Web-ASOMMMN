/**
 * Logs de arranque por fases, escritos DIRECTO a stdout.
 *
 * main.ts crea la app con `bufferLogs: true`: Nest guarda todos sus logs
 * (incluidos los reintentos de conexión a Mongo) hasta que termina
 * NestFactory.create(). Si el arranque se queda trabado antes, el log de
 * Render no muestra nada. Estas líneas no pasan por ese buffer, y un
 * vigilante repite cada 30 s en qué fase sigue, hasta que se abre el puerto.
 *
 * main.ts importa PRIMERO ./inicio-arranque, que escribe la primera línea y
 * arranca el vigilante antes de cargar el resto del código.
 */

export type FaseArranque =
  | 'modulos'
  | 'nest'
  | 'mongo'
  | 'init'
  | 'escuchando'
  | 'indices';

const inicio = Date.now();
let faseActual: FaseArranque = 'modulos';
let desdeFase = inicio;
let vigilante: ReturnType<typeof setInterval> | null = null;

type Escritor = (linea: string) => void;
let escribir: Escritor = (linea) => {
  process.stdout.write(`${linea}\n`);
};

/** Solo para pruebas. */
export function _usarEscritor(fn: Escritor): void {
  escribir = fn;
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function memoria(): string {
  return `${Math.round(process.memoryUsage().rss / 1048576)}MB`;
}

export function lineaArranque(
  fase: string,
  mensaje: string,
  ahora = Date.now(),
): string {
  return `[arranque] t=${segundos(ahora - inicio)} rss=${memoria()} fase=${fase} ${mensaje}`;
}

export function logArranque(mensaje: string, fase: string = faseActual): void {
  escribir(lineaArranque(fase, mensaje));
}

/** Cambia de fase y lo registra. */
export function fase(nueva: FaseArranque, mensaje: string): void {
  faseActual = nueva;
  desdeFase = Date.now();
  logArranque(mensaje, nueva);
}

export function faseEnCurso(): FaseArranque {
  return faseActual;
}

/** Cada `cadaMs` repite la fase en curso hasta que se llame a detener. */
export function iniciarVigilante(cadaMs = 30_000): void {
  if (vigilante) return;
  vigilante = setInterval(() => {
    logArranque(
      `sigue en esta fase desde hace ${segundos(Date.now() - desdeFase)} (puerto aún sin abrir)`,
    );
  }, cadaMs);
  vigilante.unref();
}

export function detenerVigilante(): void {
  if (vigilante) clearInterval(vigilante);
  vigilante = null;
}

/** Host(s) de la URI de Mongo, SIN usuario ni contraseña. */
export function hostMongo(uri: string | undefined): string {
  if (!uri) return '(sin MONGODB_URI)';
  const sinEsquema = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const trasCredenciales = sinEsquema.includes('@')
    ? sinEsquema.slice(sinEsquema.lastIndexOf('@') + 1)
    : sinEsquema;
  return trasCredenciales.split(/[/?]/)[0] || '(host desconocido)';
}
