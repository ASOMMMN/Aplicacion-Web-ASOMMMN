import { normalizarBusqueda } from '../../../common/utils/normalizar-texto.util';
import { CandidatoListaItemDto } from '../dto/evaluaciones-response.dto';
import {
  CampoOrdenableCandidato,
  EstadoCandidato,
  ESTADOS_CANDIDATO,
  NivelAvance,
  NivelDocsEvaluados,
  OrigenEliminacionCandidato,
  VistaCandidatos,
} from '../dto/listar-candidatos-query.dto';
import { ESTADO_GENERAL_RANGO } from './estado-candidato.util';

export interface FiltrosCandidatosNormalizados {
  q?: string;
  vacante?: string[];
  estado?: EstadoCandidato[];
  fechaDesde?: string;
  fechaHasta?: string;
  actividadAntesDe?: string;
  avance?: NivelAvance;
  docs?: NivelDocsEvaluados;
  ordenarPor?: CampoOrdenableCandidato;
  direccion?: 'asc' | 'desc';
}

export interface ResultadoFiltrarOrdenarCandidatos {
  data: CandidatoListaItemDto[];
  total: number;
  /** Distribución por estadoGeneral sobre el conjunto filtrado SIN aplicar `estado` (para KPIs/chips). */
  conteos: Record<EstadoCandidato, number>;
}

/**
 * Fin de día inclusivo: si la fecha viene sin hora (YYYY-MM-DD), la extiende
 * a 23:59:59.999 UTC — igual que `new Date('YYYY-MM-DD')` interpreta ese
 * mismo string como medianoche UTC, para no mezclar UTC y hora local.
 */
function finDeDiaInclusivo(fechaIso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    return new Date(`${fechaIso}T23:59:59.999Z`);
  }
  return new Date(fechaIso);
}

function enRangoFecha(
  fecha: Date | undefined,
  desde?: string,
  hasta?: string,
): boolean {
  if (!desde && !hasta) return true;
  if (!fecha) return false;
  const tiempo = fecha.getTime();
  if (desde && tiempo < new Date(desde).getTime()) return false;
  if (hasta && tiempo > finDeDiaInclusivo(hasta).getTime()) return false;
  return true;
}

function cumpleAvance(
  item: CandidatoListaItemDto,
  avance?: NivelAvance,
): boolean {
  if (!avance) return true;
  if (avance === 'sin_avance') return item.porcentajeExpediente === 0;
  if (avance === 'completo') return item.porcentajeExpediente === 100;
  return item.porcentajeExpediente > 0 && item.porcentajeExpediente < 100;
}

function cumpleDocs(
  item: CandidatoListaItemDto,
  docs?: NivelDocsEvaluados,
): boolean {
  if (!docs) return true;
  const evaluados = item.docsEvaluados ?? 0;
  const total = item.docsTotal ?? 0;
  if (docs === 'ninguno') return evaluados === 0;
  if (docs === 'completo') return total > 0 && evaluados === total;
  return evaluados > 0 && evaluados < total;
}

/** Todo excepto `estado` — es la base sobre la que se calculan los `conteos`. */
function aplicarFiltrosBase(
  items: CandidatoListaItemDto[],
  filtros: FiltrosCandidatosNormalizados,
  vista: VistaCandidatos,
  origenEliminacion: OrigenEliminacionCandidato | undefined,
): CandidatoListaItemDto[] {
  const q = filtros.q ? normalizarBusqueda(filtros.q) : '';
  const qValido = q.length >= 2;
  const vacantes =
    filtros.vacante?.map((v) => v.toLowerCase()).filter(Boolean) ?? [];

  return items.filter((item) => {
    if (vista === 'activos' && item.eliminado) return false;
    if (vista === 'papelera' && !item.eliminado) return false;
    if (vista === 'papelera' && origenEliminacion) {
      if (item.eliminadoOrigen !== origenEliminacion) return false;
    }

    if (vacantes.length > 0) {
      const vacanteItem = (item.vacante ?? '').toLowerCase();
      if (!vacantes.some((v) => vacanteItem.includes(v))) return false;
    }

    if (qValido) {
      const matches =
        normalizarBusqueda(item.nombreCompleto).includes(q) ||
        normalizarBusqueda(item.email).includes(q);
      if (!matches) return false;
    }

    if (!cumpleAvance(item, filtros.avance)) return false;
    if (!cumpleDocs(item, filtros.docs)) return false;

    const fechaReferencia =
      vista === 'papelera' ? item.eliminadoEn : new Date(item.creadoEn);
    if (
      !enRangoFecha(fechaReferencia, filtros.fechaDesde, filtros.fechaHasta)
    ) {
      return false;
    }

    if (filtros.actividadAntesDe) {
      const corte = new Date(filtros.actividadAntesDe).getTime();
      const actividad = item.actualizadoEn
        ? new Date(item.actualizadoEn).getTime()
        : 0;
      if (actividad > corte) return false;
    }

    return true;
  });
}

function contarPorEstado(
  items: CandidatoListaItemDto[],
): Record<EstadoCandidato, number> {
  const conteos = Object.fromEntries(
    ESTADOS_CANDIDATO.map((estado) => [estado, 0]),
  ) as Record<EstadoCandidato, number>;
  for (const item of items) {
    conteos[item.estadoGeneral] += 1;
  }
  return conteos;
}

function compararNullable(va: unknown, vb: unknown, direccion: number): number {
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (va < vb) return -1 * direccion;
  if (va > vb) return 1 * direccion;
  return 0;
}

function comparar(
  a: CandidatoListaItemDto,
  b: CandidatoListaItemDto,
  campo: CampoOrdenableCandidato,
  direccion: number,
): number {
  if (campo === 'nombreCompleto') {
    return (
      a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', {
        sensitivity: 'base',
      }) * direccion
    );
  }
  if (campo === 'estadoGeneral') {
    return (
      (ESTADO_GENERAL_RANGO[a.estadoGeneral] -
        ESTADO_GENERAL_RANGO[b.estadoGeneral]) *
      direccion
    );
  }
  if (campo === 'docsEvaluados') {
    const ratioA = a.docsTotal ? a.docsEvaluados / a.docsTotal : 0;
    const ratioB = b.docsTotal ? b.docsEvaluados / b.docsTotal : 0;
    if (ratioA !== ratioB) return (ratioA - ratioB) * direccion;
    return (a.docsEvaluados - b.docsEvaluados) * direccion;
  }
  return compararNullable(a[campo], b[campo], direccion);
}

/**
 * Sin `ordenarPor`: enviados sin evaluar primero, por fecha de envío
 * ascendente (FIFO: el que lleva más tiempo esperando se evalúa primero);
 * el resto, por última actividad descendente.
 */
function ordenarPorDefecto(
  items: CandidatoListaItemDto[],
  enviadoEnPorPostulante: Map<string, Date | undefined>,
): CandidatoListaItemDto[] {
  const pendienteEnviado = (item: CandidatoListaItemDto) =>
    item.estadoGeneral === 'enviado';

  return [...items].sort((a, b) => {
    const aPendiente = pendienteEnviado(a);
    const bPendiente = pendienteEnviado(b);
    if (aPendiente !== bPendiente) return aPendiente ? -1 : 1;
    if (aPendiente && bPendiente) {
      const aEnviadoEn = enviadoEnPorPostulante.get(a.postulanteId);
      const bEnviadoEn = enviadoEnPorPostulante.get(b.postulanteId);
      const diff =
        (aEnviadoEn ? new Date(aEnviadoEn).getTime() : 0) -
        (bEnviadoEn ? new Date(bEnviadoEn).getTime() : 0);
      if (diff !== 0) return diff;
      return a.postulanteId.localeCompare(b.postulanteId);
    }
    const aAct = a.actualizadoEn ? new Date(a.actualizadoEn).getTime() : 0;
    const bAct = b.actualizadoEn ? new Date(b.actualizadoEn).getTime() : 0;
    if (aAct !== bAct) return bAct - aAct;
    return a.postulanteId.localeCompare(b.postulanteId);
  });
}

function ordenar(
  items: CandidatoListaItemDto[],
  ordenarPor: CampoOrdenableCandidato | undefined,
  direccionQuery: 'asc' | 'desc' | undefined,
  enviadoEnPorPostulante: Map<string, Date | undefined>,
): CandidatoListaItemDto[] {
  if (!ordenarPor) return ordenarPorDefecto(items, enviadoEnPorPostulante);

  const direccion = direccionQuery === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const resultado = comparar(a, b, ordenarPor, direccion);
    if (resultado !== 0) return resultado;
    // Desempate estable: evita filas repetidas/saltadas entre páginas.
    return a.postulanteId.localeCompare(b.postulanteId);
  });
}

/**
 * Filtra, calcula conteos por estado y ordena el listado de candidatos.
 * Pura (sin Mongo, sin request) y compartida por listarCandidatos,
 * resumenCandidatos y exportarCandidatosCSV — los 3 deben coincidir en el
 * conjunto resultante para los mismos filtros.
 */
export function filtrarOrdenarCandidatos(
  items: CandidatoListaItemDto[],
  filtros: FiltrosCandidatosNormalizados,
  vista: VistaCandidatos,
  origenEliminacion: OrigenEliminacionCandidato | undefined,
  enviadoEnPorPostulante: Map<string, Date | undefined>,
): ResultadoFiltrarOrdenarCandidatos {
  const baseFiltrado = aplicarFiltrosBase(
    items,
    filtros,
    vista,
    origenEliminacion,
  );
  const conteos = contarPorEstado(baseFiltrado);

  const filtrado =
    filtros.estado && filtros.estado.length > 0
      ? baseFiltrado.filter((item) =>
          filtros.estado!.includes(item.estadoGeneral),
        )
      : baseFiltrado;

  const ordenado = ordenar(
    filtrado,
    filtros.ordenarPor,
    filtros.direccion,
    enviadoEnPorPostulante,
  );

  return { data: ordenado, total: ordenado.length, conteos };
}
