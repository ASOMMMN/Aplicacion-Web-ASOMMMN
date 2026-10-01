/**
 * Combinación de las lecturas deterministas (QR / cadena original y
 * etiquetas del texto) con las fechas de la IA ya validadas.
 *
 * Reglas (ver PROGRESS.md, "Diseño: combinación de fuentes"):
 * - Prioridad por campo: qr > texto > ocr > ia. En conflicto gana la de
 *   mayor prioridad y se marca "Revisar" con ambos valores y sus fuentes.
 * - Coincidente: la fuente es qr, o una lectura determinista y la IA tienen
 *   la misma `clave` (que conserva la precisión: "2016" ≠ "2016-01-01").
 * - Varios documentos en el archivo: se conservan todos los grupos; las
 *   fechas oficiales salen del grupo con el vencimiento más reciente.
 * - La IA se compara contra el grupo principal; si coincide con otro grupo
 *   se marca "Revisar" (y no se mezclan fechas de documentos distintos).
 * - Sin lecturas deterministas, el resultado es el de la IA tal cual.
 * - Con fechas verificadas por el evaluador no se agregan motivos: el
 *   análisis solo deja evidencia.
 *
 * Módulo puro: no lee archivos ni llama a la IA.
 */
import type {
  CampoFecha,
  Confianza,
  ExtraerDocPersonalIaResponse,
} from './extraer-fechas-doc-personal';
import type { FuenteLectura, LecturaFecha } from './extractor-etiquetas';
import { formatearConPrecision, PrecisionFecha } from './formatos-fecha';

const CAMPOS: CampoFecha[] = [
  'fechaEmision',
  'fechaInicio',
  'fechaVencimiento',
];

/** Fuente final de una fecha: una determinista o la IA. */
export type FuenteFecha = Exclude<FuenteLectura, 'ia1' | 'ia2'> | 'ia';

const PRIORIDAD: Record<FuenteFecha, number> = {
  qr: 0,
  texto: 1,
  ocr: 2,
  ia: 3,
};

const NOMBRE_FUENTE: Record<FuenteFecha, string> = {
  qr: 'QR/cadena original',
  texto: 'etiqueta del texto',
  ocr: 'OCR',
  ia: 'IA',
};

const NOMBRE_CAMPO: Record<CampoFecha, string> = {
  fechaEmision: 'emisión',
  fechaInicio: 'inicio',
  fechaVencimiento: 'vencimiento',
};

/** Una lectura de un campo, de cualquier fuente (evidencia). */
export interface LecturaCampo {
  fuente: FuenteFecha;
  valor: string;
  precision: PrecisionFecha;
  clave: string;
  textoLiteral: string | null;
  etiqueta: string | null;
  /** Ausente en la IA (no dice de qué página la tomó). */
  pagina?: number;
}

/** Fecha elegida para un campo dentro de un grupo (documento). */
export interface FechaDeGrupo {
  valor: string;
  precision: PrecisionFecha;
  fuente: FuenteFecha;
  clave: string;
}

export interface GrupoFechas {
  /** Posición del documento en el archivo (0, 1…). */
  indice: number;
  principal: boolean;
  paginas: number[];
  fechas: Partial<Record<CampoFecha, FechaDeGrupo>>;
}

/** Resultado por campo (se guarda en detalleFechasIa.fuentes[campo]). */
export interface FuenteCampo {
  valor: string | null;
  precision: PrecisionFecha;
  fuente: FuenteFecha | null;
  coincidente: boolean;
  /** Lecturas del campo en el grupo principal y de la IA, por prioridad. */
  lecturas: LecturaCampo[];
}

export interface EntradaCombinacion {
  /** Lecturas deterministas (etiquetas por página y paginas[].estructuradas). */
  lecturas: LecturaFecha[];
  /** Fechas de la IA ya validadas; null si no hubo respuesta usable. */
  ia: Pick<ExtraerDocPersonalIaResponse, 'detalle' | 'confianza'> | null;
  /** El evaluador corrigió las fechas: solo se deja evidencia. */
  fechasVerificadas?: boolean;
}

export interface ResultadoCombinacion {
  /** Índice del grupo principal en `grupos`; null sin lecturas deterministas. */
  principal: number | null;
  grupos: GrupoFechas[];
  fuentes: Record<CampoFecha, FuenteCampo>;
  motivosRevision: string[];
  confianza: Record<CampoFecha, Confianza>;
}

const fuenteDe = (f: FuenteLectura): FuenteFecha =>
  f === 'ia1' || f === 'ia2' ? 'ia' : f;

/** Clave de comparación de un valor guardado, según su precisión. */
export function claveDeValor(valor: string, precision: PrecisionFecha): string {
  if (precision === 'anio') return valor.slice(0, 4);
  if (precision === 'mes') return valor.slice(0, 7);
  return valor.slice(0, 10);
}

const mostrar = (l: { valor: string; precision: PrecisionFecha }) =>
  formatearConPrecision(l.valor, l.precision) ?? l.valor;

const deLectura = (l: LecturaFecha): LecturaCampo => ({
  fuente: fuenteDe(l.fuente),
  valor: l.valor,
  precision: l.precision,
  clave: l.clave,
  textoLiteral: l.textoLiteral,
  etiqueta: l.etiqueta,
  pagina: l.pagina,
});

const porPrioridad = (a: LecturaCampo, b: LecturaCampo) =>
  PRIORIDAD[a.fuente] - PRIORIDAD[b.fuente];

// ── Agrupación de las lecturas en documentos ───────────────────────────────

/** Lecturas de un mismo texto (fuente y página) y un mismo grupo local. */
interface Unidad {
  fuente: FuenteFecha;
  pagina: number;
  grupo: number;
  lecturas: LecturaFecha[];
}

interface Documento {
  fuentes: Set<FuenteFecha>;
  paginas: Set<number>;
  claves: Map<CampoFecha, Set<string>>;
  lecturas: LecturaFecha[];
}

function unidades(lecturas: LecturaFecha[]): Unidad[] {
  const mapa = new Map<string, Unidad>();
  for (const l of lecturas) {
    const fuente = fuenteDe(l.fuente);
    const k = `${fuente}|${l.pagina}|${l.grupo}`;
    const u = mapa.get(k) ?? {
      fuente,
      pagina: l.pagina,
      grupo: l.grupo,
      lecturas: [],
    };
    u.lecturas.push(l);
    mapa.set(k, u);
  }
  return [...mapa.values()].sort(
    (a, b) =>
      PRIORIDAD[a.fuente] - PRIORIDAD[b.fuente] ||
      a.pagina - b.pagina ||
      a.grupo - b.grupo,
  );
}

/**
 * Los grupos del extractor son locales a cada texto. Una unidad se une a un
 * documento si:
 * - es de otra fuente en la misma página y comparte alguna fecha (QR y
 *   etiquetas leyendo el mismo documento; si además difieren en otro campo,
 *   es un conflicto dentro del documento), o
 * - no contradice ningún campo del documento (se complementan: emisión en
 *   una página y vencimiento en otra).
 * Preferencia: primero un documento con el que comparte alguna fecha.
 */
function agrupar(lecturas: LecturaFecha[]): Documento[] {
  const docs: Documento[] = [];
  for (const u of unidades(lecturas)) {
    const relacion = (d: Documento) => {
      let comparte = false;
      let contradice = false;
      for (const l of u.lecturas) {
        const claves = d.claves.get(l.campo);
        if (!claves) continue;
        if (claves.has(l.clave)) comparte = true;
        else contradice = true;
      }
      const otraFuente = !d.fuentes.has(u.fuente) && d.paginas.has(u.pagina);
      return { comparte, compatible: !contradice || (comparte && otraFuente) };
    };
    const destino =
      docs.find((d) => {
        const r = relacion(d);
        return r.comparte && r.compatible;
      }) ?? docs.find((d) => relacion(d).compatible);

    const d = destino ?? {
      fuentes: new Set<FuenteFecha>(),
      paginas: new Set<number>(),
      claves: new Map<CampoFecha, Set<string>>(),
      lecturas: [],
    };
    if (!destino) docs.push(d);
    d.fuentes.add(u.fuente);
    d.paginas.add(u.pagina);
    for (const l of u.lecturas) {
      d.lecturas.push(l);
      d.claves.set(l.campo, (d.claves.get(l.campo) ?? new Set()).add(l.clave));
    }
  }
  // Orden de aparición en el archivo.
  const inicio = (d: Documento) =>
    Math.min(...d.lecturas.map((l) => l.pagina * 1e7 + l.posicion));
  return docs.sort((a, b) => inicio(a) - inicio(b));
}

/** Lecturas de un campo en un documento, por prioridad (la primera gana). */
function lecturasDeCampo(d: Documento, campo: CampoFecha): LecturaCampo[] {
  return d.lecturas
    .filter((l) => l.campo === campo)
    .map(deLectura)
    .sort(porPrioridad);
}

// ── Combinación ────────────────────────────────────────────────────────────

export function combinarFuentes(
  entrada: EntradaCombinacion,
): ResultadoCombinacion {
  const { ia } = entrada;
  const lecturaIa = (campo: CampoFecha): LecturaCampo | null => {
    const f = ia?.detalle?.[campo];
    if (!f?.valor) return null;
    return {
      fuente: 'ia',
      valor: f.valor,
      precision: f.precision,
      clave: claveDeValor(f.valor, f.precision),
      textoLiteral: f.textoLiteral,
      etiqueta: f.etiqueta,
    };
  };
  const confianzaIa = (campo: CampoFecha): Confianza =>
    ia?.confianza?.[campo] ?? 'baja';

  const docs = agrupar(entrada.lecturas);

  // Sin lecturas deterministas: el flujo de siempre (solo IA).
  if (docs.length === 0) {
    const fuentes = {} as Record<CampoFecha, FuenteCampo>;
    const confianza = {} as Record<CampoFecha, Confianza>;
    for (const campo of CAMPOS) {
      const l = lecturaIa(campo);
      fuentes[campo] = {
        valor: l?.valor ?? null,
        precision: l?.precision ?? 'dia',
        fuente: l ? 'ia' : null,
        coincidente: false,
        lecturas: l ? [l] : [],
      };
      confianza[campo] = confianzaIa(campo);
    }
    return {
      principal: null,
      grupos: [],
      fuentes,
      motivosRevision: [],
      confianza,
    };
  }

  const motivos: string[] = [];
  const conflictoInterno = new Set<CampoFecha>();

  const grupos: GrupoFechas[] = docs.map((d, indice) => {
    const fechas: GrupoFechas['fechas'] = {};
    for (const campo of CAMPOS) {
      const ls = lecturasDeCampo(d, campo);
      if (ls.length === 0) continue;
      const [elegida] = ls;
      fechas[campo] = {
        valor: elegida.valor,
        precision: elegida.precision,
        fuente: elegida.fuente,
        clave: elegida.clave,
      };
    }
    return {
      indice,
      principal: false,
      paginas: [...d.paginas].sort((a, b) => a - b),
      fechas,
    };
  });

  // Principal: el vencimiento más reciente; sin vencimientos, el primero.
  let principal = 0;
  grupos.forEach((g, i) => {
    const v = g.fechas.fechaVencimiento?.valor;
    const actual = grupos[principal].fechas.fechaVencimiento?.valor;
    if (v && (!actual || v > actual)) principal = i;
  });
  grupos[principal].principal = true;

  if (grupos.length > 1) {
    const venc = grupos[principal].fechas.fechaVencimiento;
    motivos.push(
      `Se detectaron ${grupos.length} documentos en el archivo; ${
        venc
          ? `se usó el de vencimiento más reciente (${mostrar(venc)})`
          : 'se usó el primero'
      }.`,
    );
  }

  // Conflictos entre fuentes deterministas dentro del documento principal.
  const docPrincipal = docs[principal];
  for (const campo of CAMPOS) {
    const ls = lecturasDeCampo(docPrincipal, campo);
    const distinta = ls.find((l) => l.clave !== ls[0]?.clave);
    if (distinta) {
      conflictoInterno.add(campo);
      motivos.push(
        `La ${NOMBRE_CAMPO[campo]} difiere: ${NOMBRE_FUENTE[ls[0].fuente]} dice ${mostrar(ls[0])}; ${NOMBRE_FUENTE[distinta.fuente]} dice ${mostrar(distinta)}. Se usó la de ${NOMBRE_FUENTE[ls[0].fuente]}.`,
      );
    }
  }

  /** Otro documento del archivo con esa misma fecha en el campo. */
  const enOtroGrupo = (campo: CampoFecha, clave: string) =>
    grupos.find((g, i) => i !== principal && g.fechas[campo]?.clave === clave);

  const fuentes = {} as Record<CampoFecha, FuenteCampo>;
  const confianza = {} as Record<CampoFecha, Confianza>;
  for (const campo of CAMPOS) {
    const deterministas = lecturasDeCampo(docPrincipal, campo);
    const delIa = lecturaIa(campo);
    const elegida = deterministas[0];
    const lecturas = delIa ? [...deterministas, delIa] : deterministas;

    if (elegida) {
      const iaCoincide = Boolean(delIa && delIa.clave === elegida.clave);
      let desacuerdo = conflictoInterno.has(campo);
      if (delIa && !iaCoincide) {
        desacuerdo = true;
        const otro = enOtroGrupo(campo, delIa.clave);
        motivos.push(
          otro
            ? `La IA leyó la ${NOMBRE_CAMPO[campo]} (${mostrar(delIa)}) de otro documento del archivo (documento ${otro.indice + 1}); se usó la del documento principal (${mostrar(elegida)}, ${NOMBRE_FUENTE[elegida.fuente]}).`
            : `La ${NOMBRE_CAMPO[campo]} difiere: ${NOMBRE_FUENTE[elegida.fuente]} dice ${mostrar(elegida)}; la IA dice ${mostrar(delIa)}. Se usó la de ${NOMBRE_FUENTE[elegida.fuente]}.`,
        );
      }
      const coincidente = elegida.fuente === 'qr' || iaCoincide;
      fuentes[campo] = {
        valor: elegida.valor,
        precision: elegida.precision,
        fuente: elegida.fuente,
        coincidente,
        lecturas,
      };
      confianza[campo] = desacuerdo ? 'baja' : coincidente ? 'alta' : 'media';
      continue;
    }

    if (delIa) {
      const otro = enOtroGrupo(campo, delIa.clave);
      if (otro) {
        // Es la fecha de otro documento: no se mezcla con el principal.
        motivos.push(
          `La IA leyó la ${NOMBRE_CAMPO[campo]} (${mostrar(delIa)}) de otro documento del archivo (documento ${otro.indice + 1}); no se usó en el documento principal.`,
        );
        fuentes[campo] = {
          valor: null,
          precision: 'dia',
          fuente: null,
          coincidente: false,
          lecturas,
        };
        confianza[campo] = 'baja';
        continue;
      }
      fuentes[campo] = {
        valor: delIa.valor,
        precision: delIa.precision,
        fuente: 'ia',
        coincidente: false,
        lecturas,
      };
      confianza[campo] = confianzaIa(campo);
      continue;
    }

    fuentes[campo] = {
      valor: null,
      precision: 'dia',
      fuente: null,
      coincidente: false,
      lecturas: [],
    };
    confianza[campo] = 'baja';
  }

  return {
    principal,
    grupos,
    fuentes,
    motivosRevision: entrada.fechasVerificadas ? [] : motivos,
    confianza,
  };
}

// ── Lectura de lo guardado (detalleFechasIa) para la API ───────────────────

/** Fuente y estado de una fecha, tal como se expone en la API. */
export interface FuenteFechaResumen {
  fuente: FuenteFecha;
  coincidente: boolean;
}

/** Fecha de un documento detectado en el archivo, para la API. */
export interface DocumentoDetectado {
  principal: boolean;
  paginas: number[];
  fechas: Partial<
    Record<
      CampoFecha,
      { valor: string; precision: PrecisionFecha; fuente: FuenteFecha }
    >
  >;
}

export interface ResumenFuentes {
  fuentesFechas?: Partial<Record<CampoFecha, FuenteFechaResumen>>;
  /** Solo si se detectó más de un documento en el archivo. */
  documentosDetectados?: DocumentoDetectado[];
}

const esFuente = (v: unknown): v is FuenteFecha =>
  typeof v === 'string' && v in PRIORIDAD;

/**
 * Fuente y "Coincidente" por fecha, y los documentos detectados, a partir de
 * `detalleFechasIa`. Vacío en documentos analizados antes de la combinación
 * de fuentes y en los que tienen fechas verificadas (sus fechas ya no son
 * las del análisis).
 */
export function resumenFuentes(
  detalleFechasIa: unknown,
  fechasVerificadas: boolean,
): ResumenFuentes {
  if (fechasVerificadas || !detalleFechasIa) return {};
  const d = detalleFechasIa as {
    fuentes?: Partial<Record<CampoFecha, Partial<FuenteCampo>>>;
    grupos?: GrupoFechas[];
  };
  const r: ResumenFuentes = {};
  if (d.fuentes && typeof d.fuentes === 'object') {
    const fuentes: ResumenFuentes['fuentesFechas'] = {};
    for (const campo of CAMPOS) {
      const f = d.fuentes[campo];
      if (f?.valor && esFuente(f.fuente)) {
        fuentes[campo] = {
          fuente: f.fuente,
          coincidente: Boolean(f.coincidente),
        };
      }
    }
    r.fuentesFechas = fuentes;
  }
  if (Array.isArray(d.grupos) && d.grupos.length > 1) {
    r.documentosDetectados = d.grupos.map((g) => ({
      principal: Boolean(g.principal),
      paginas: Array.isArray(g.paginas) ? g.paginas : [],
      fechas: Object.fromEntries(
        CAMPOS.flatMap((c) => {
          const f = g.fechas?.[c];
          return f
            ? [
                [
                  c,
                  { valor: f.valor, precision: f.precision, fuente: f.fuente },
                ],
              ]
            : [];
        }),
      ),
    }));
  }
  return r;
}
