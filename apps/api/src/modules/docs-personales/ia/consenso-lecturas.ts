/**
 * Consenso entre lecturas independientes del modelo (ia1, ia2, ia3).
 *
 * Por campo, comparando la `clave` (valor con su precisión; null cuenta como
 * un valor más):
 * - Todas las lecturas coinciden → se acepta con confianza "alta" (la
 *   validación posterior la baja si hay motivo, p. ej. dd/mm ambiguo).
 * - Dos lecturas no coinciden y no hay tercera → hace falta desempate.
 * - Con tres: mayoría (2 de 3) → se acepta con confianza "media".
 * - Sin mayoría → la lectura más confiable de ese campo, confianza "baja" y
 *   un motivo para Revisar. Nunca se inventa un valor.
 *
 * Módulo puro: recibe lecturas ya validadas y no llama al modelo.
 */
import type {
  CampoFecha,
  Confianza,
  ExtraerDocPersonalIaResponse,
  FechaDetectada,
} from './extraer-fechas-doc-personal';
import { claveDeValor } from './combinar-fuentes';
import { formatearConPrecision } from './formatos-fecha';

const CAMPOS: CampoFecha[] = [
  'fechaEmision',
  'fechaInicio',
  'fechaVencimiento',
];

const NOMBRE_CAMPO: Record<CampoFecha, string> = {
  fechaEmision: 'emisión',
  fechaInicio: 'inicio',
  fechaVencimiento: 'vencimiento',
};

export type IdLectura = 'ia1' | 'ia2' | 'ia3';

export interface LecturaIa {
  id: IdLectura;
  /** Respuesta del modelo ya normalizada y validada contra su texto literal. */
  resultado: ExtraerDocPersonalIaResponse;
}

export type EstadoConsenso =
  | 'una_lectura'
  | 'unanime'
  | 'mayoria'
  | 'sin_mayoria';

export interface ConsensoCampo {
  estado: EstadoConsenso;
  /** Lectura cuyo valor se usó. */
  elegida: IdLectura;
  /** Clave de cada lectura ("∅" = sin fecha). */
  claves: Partial<Record<IdLectura, string>>;
}

export interface ResultadoConsenso {
  /** Respuesta combinada (pendiente de volver a validar). */
  resultado: ExtraerDocPersonalIaResponse;
  porCampo: Record<CampoFecha, ConsensoCampo>;
  /** Hay campos en desacuerdo y solo dos lecturas: pedir una tercera. */
  requiereDesempate: boolean;
  motivos: string[];
}

const SIN_FECHA = '∅';
const ORDEN: Confianza[] = ['baja', 'media', 'alta'];

const claveDe = (f?: FechaDetectada) =>
  f?.valor ? claveDeValor(f.valor, f.precision) : SIN_FECHA;

const mostrar = (f?: FechaDetectada) =>
  f?.valor
    ? (formatearConPrecision(f.valor, f.precision) ?? f.valor)
    : 'sin fecha';

/** Valor más repetido y cuántas veces aparece (empate → el primero). */
function masVotado<T>(valores: T[]): { valor: T; votos: number } {
  const cuenta = new Map<T, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor = { valor: valores[0], votos: 0 };
  for (const v of valores) {
    const n = cuenta.get(v)!;
    if (n > mejor.votos) mejor = { valor: v, votos: n };
  }
  return mejor;
}

export function consensoLecturas(lecturas: LecturaIa[]): ResultadoConsenso {
  if (lecturas.length === 0) throw new Error('consensoLecturas: sin lecturas');
  const [primera] = lecturas;
  const motivos: string[] = [];
  const porCampo = {} as Record<CampoFecha, ConsensoCampo>;
  const detalle = {} as Record<CampoFecha, FechaDetectada>;
  let requiereDesempate = false;

  for (const campo of CAMPOS) {
    const fechas = lecturas.map((l) => l.resultado.detalle?.[campo]);
    const claves = lecturas.map((l, i) => [l.id, claveDe(fechas[i])] as const);
    const clavesPorId = Object.fromEntries(claves);
    const { valor: ganadora, votos } = masVotado(claves.map(([, c]) => c));

    let estado: EstadoConsenso;
    let indice: number;
    let confianza: Confianza;
    if (lecturas.length === 1) {
      estado = 'una_lectura';
      indice = 0;
      confianza = fechas[0]?.confianza ?? 'baja';
    } else if (votos === lecturas.length) {
      estado = 'unanime';
      indice = 0;
      confianza = 'alta';
    } else if (lecturas.length === 2) {
      // Desacuerdo con dos lecturas: provisional (la primera) hasta el desempate.
      requiereDesempate = true;
      estado = 'sin_mayoria';
      indice = 0;
      confianza = 'baja';
    } else if (votos >= 2) {
      estado = 'mayoria';
      indice = claves.findIndex(([, c]) => c === ganadora);
      confianza = 'media';
    } else {
      estado = 'sin_mayoria';
      // La lectura con mayor confianza en este campo; empate → la primera.
      indice = fechas.reduce(
        (mejor, f, i) =>
          ORDEN.indexOf(f?.confianza ?? 'baja') >
          ORDEN.indexOf(fechas[mejor]?.confianza ?? 'baja')
            ? i
            : mejor,
        0,
      );
      confianza = 'baja';
      motivos.push(
        `Las lecturas de la IA no coinciden en la ${NOMBRE_CAMPO[campo]} (${lecturas
          .map((l, i) => `${l.id}: ${mostrar(fechas[i])}`)
          .join('; ')}); se usó la más confiable.`,
      );
    }

    const base = fechas[indice] ?? {
      valor: null,
      textoLiteral: null,
      etiqueta: null,
      confianza: 'baja' as Confianza,
      precision: 'dia' as const,
    };
    detalle[campo] = { ...base, confianza: base.valor ? confianza : 'baja' };
    porCampo[campo] = {
      estado,
      elegida: lecturas[indice].id,
      claves: clavesPorId,
    };
  }

  // Tipo detectado: el más votado; su confianza, la menor entre quienes lo dicen.
  const tipos = lecturas.map((l) => l.resultado.tipoDetectado ?? null);
  const { valor: tipoDetectado } = masVotado(tipos);
  const confianzaTipo = lecturas
    .filter((l) => (l.resultado.tipoDetectado ?? null) === tipoDetectado)
    .map((l) => l.resultado.confianzaTipo ?? 'baja')
    .reduce<Confianza>(
      (min, c) => (ORDEN.indexOf(c) < ORDEN.indexOf(min) ? c : min),
      'alta',
    );

  const resultado: ExtraerDocPersonalIaResponse = {
    ...primera.resultado,
    fechaEmision: detalle.fechaEmision.valor,
    fechaInicio: detalle.fechaInicio.valor,
    fechaVencimiento: detalle.fechaVencimiento.valor,
    confianza: {
      fechaEmision: detalle.fechaEmision.confianza,
      fechaInicio: detalle.fechaInicio.confianza,
      fechaVencimiento: detalle.fechaVencimiento.confianza,
    },
    detalle,
    tipoDetectado,
    confianzaTipo,
    formatoFechaIndicado:
      lecturas.find((l) => l.resultado.formatoFechaIndicado)?.resultado
        .formatoFechaIndicado ?? null,
    fechasDescartadas: [
      ...new Set(lecturas.flatMap((l) => l.resultado.fechasDescartadas ?? [])),
    ],
  };
  return { resultado, porCampo, requiereDesempate, motivos };
}
