'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import type { EstadoGeneral } from '@/lib/estadoCandidato';

export type EstadoExpediente = 'en_proceso' | 'enviado';
export type EstadoEvaluacion = 'pendiente' | 'en_evaluacion' | 'evaluado';
export type CampoOrden =
  | 'actualizadoEn'
  | 'creadoEn'
  | 'nombreCompleto'
  | 'porcentajeExpediente'
  | 'docsEvaluados'
  | 'eliminadoEn';
export type Direccion = 'asc' | 'desc';
export type Vista = 'activos' | 'papelera';
export type OrigenEliminacion = 'admin' | 'self' | 'desconocido';
export type NivelAvance = 'sin_avance' | 'parcial' | 'completo';
export type NivelDocs = 'ninguno' | 'parcial' | 'completo';

/** 'estadoGeneral'/'vacante' quedaron fuera: esas columnas se filtran, no se ordenan (Fase 2). */
export const CAMPOS_ORDEN_VALIDOS: CampoOrden[] = [
  'actualizadoEn',
  'creadoEn',
  'nombreCompleto',
  'porcentajeExpediente',
  'docsEvaluados',
  'eliminadoEn',
];

export interface CandidatoItem {
  postulanteId: string;
  nombreCompleto: string;
  nombre: string;
  apellidos: string;
  email: string;
  ciudad?: string;
  pais?: string;
  vacante?: string;
  creadoEn: string;
  actualizadoEn?: string;
  estadoExpediente: EstadoExpediente;
  porcentajeExpediente: number;
  requisitosFaltantes: string[];
  docsEvaluados: number;
  docsTotal: number;
  estadoEvaluacion: EstadoEvaluacion;
  /** Única fuente de verdad del estado visible en la UI — calculado y expuesto por el backend. */
  estadoGeneral: EstadoGeneral;
  eliminado: boolean;
  eliminadoOrigen?: OrigenEliminacion;
  eliminadoEn?: string;
  eliminadoMotivo?: string;
  /** Solo viene del backend si quien pide el listado es ADMIN. */
  eliminadoPorNombre?: string;
  eliminadoPorEmail?: string;
}

export interface CandidatosPaginados {
  data: CandidatoItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ResumenCandidatos {
  incompleto: number;
  en_proceso: number;
  completo: number;
  enviado: number;
  evaluado: number;
  total: number;
  /** Solo viene del backend si quien pide el resumen es ADMIN. */
  eliminados?: number;
}

const LIMIT = 20;

function aArray(valor: string | null): string[] {
  if (!valor) return [];
  return valor
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

interface QueryInicial {
  page: number;
  q: string;
  vacante: string[];
  estado: EstadoGeneral[];
  avance: NivelAvance | '';
  docs: NivelDocs | '';
  fechaDesde: string;
  fechaHasta: string;
  actividadAntesDe: string;
  ordenarPor: CampoOrden | '';
  direccion: Direccion;
  vista: Vista;
  origenEliminacion: OrigenEliminacion | '';
}

function parseQueryFromLocation(): QueryInicial {
  if (typeof window === 'undefined') {
    return {
      page: 1,
      q: '',
      vacante: [],
      estado: [],
      avance: '',
      docs: '',
      fechaDesde: '',
      fechaHasta: '',
      actividadAntesDe: '',
      ordenarPor: '',
      direccion: 'desc',
      vista: 'activos',
      origenEliminacion: '',
    };
  }
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get('page') ?? '1');
  const [ordenarPor, direccion] = (sp.get('sort') ?? '').split(':');
  const vista = sp.get('vista');
  const origenEliminacion = sp.get('origen');
  const avance = sp.get('avance');
  const docs = sp.get('docs');
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    q: sp.get('q') ?? '',
    vacante: aArray(sp.get('vacante')),
    estado: aArray(sp.get('estado')) as EstadoGeneral[],
    avance: avance === 'sin_avance' || avance === 'parcial' || avance === 'completo' ? avance : '',
    docs: docs === 'ninguno' || docs === 'parcial' || docs === 'completo' ? docs : '',
    fechaDesde: sp.get('fechaDesde') ?? '',
    fechaHasta: sp.get('fechaHasta') ?? '',
    actividadAntesDe: sp.get('actividadAntesDe') ?? '',
    ordenarPor: CAMPOS_ORDEN_VALIDOS.includes(ordenarPor as CampoOrden) ? (ordenarPor as CampoOrden) : '',
    direccion: direccion === 'asc' ? 'asc' : 'desc',
    vista: vista === 'papelera' ? 'papelera' : 'activos',
    origenEliminacion:
      origenEliminacion === 'admin' || origenEliminacion === 'self' || origenEliminacion === 'desconocido'
        ? origenEliminacion
        : '',
  };
}

export const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

/**
 * Todo el estado/fetch/URL del Panel de Evaluador: filtros, orden, paginación,
 * vista Activos/Papelera, catálogo de vacantes y exportar CSV. Extraído de
 * `candidatos/page.tsx` (Fase 2) sin cambiar el comportamiento de Fase 1.
 */
export function useCandidatosQuery() {
  const router = useRouter();
  const { user } = useAuth();
  const esAdmin = user?.rol === 'administrador';
  const initial = useMemo(() => parseQueryFromLocation(), []);

  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.q);
  const [searchDebounced, setSearchDebounced] = useState(initial.q);
  const [vacanteFiltro, setVacanteFiltro] = useState<string[]>(initial.vacante);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoGeneral[]>(initial.estado);
  const [avance, setAvance] = useState<NivelAvance | ''>(initial.avance);
  const [docs, setDocs] = useState<NivelDocs | ''>(initial.docs);
  const [fechaDesde, setFechaDesde] = useState(initial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(initial.fechaHasta);
  const [actividadAntesDe, setActividadAntesDe] = useState(initial.actividadAntesDe);
  const [ordenarPor, setOrdenarPor] = useState<CampoOrden | ''>(initial.ordenarPor);
  const [direccion, setDireccion] = useState<Direccion>(initial.direccion);
  const [vista, setVista] = useState<Vista>(initial.vista);
  const [origenEliminacion, setOrigenEliminacion] = useState<OrigenEliminacion | ''>(initial.origenEliminacion);

  // Para el panel admin, la tabla por defecto ordena por fecha de postulación
  // (recientes primero) en vez de la cola FIFO que usa evaluador por defecto;
  // solo aplica si la URL no trae ya un `sort` explícito.
  const defaultAdminAplicado = useRef(false);
  useEffect(() => {
    if (defaultAdminAplicado.current || !user) return;
    defaultAdminAplicado.current = true;
    if (initial.ordenarPor) return;
    if (esAdmin) {
      setOrdenarPor('creadoEn');
      setDireccion('desc');
    }
  }, [user, esAdmin, initial.ordenarPor]);

  // La Papelera es solo para admin: si un evaluador llega a ?vista=papelera
  // (link viejo, URL escrita a mano), lo regresamos a activos. El backend
  // también lo rechaza (403) si de alguna forma llega la petición.
  useEffect(() => {
    if (!user) return;
    if (vista === 'papelera' && !esAdmin) setVista('activos');
  }, [user, esAdmin, vista]);

  const [paginado, setPaginado] = useState<CandidatosPaginados | null>(null);
  const [resumen, setResumen] = useState<ResumenCandidatos | null>(null);
  const [vacantesCatalogo, setVacantesCatalogo] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Catálogo de vacantes para el multiselect: se carga una sola vez.
  useEffect(() => {
    let vivo = true;
    api
      .get<string[]>('/evaluaciones/vacantes')
      .then((res) => {
        if (vivo) setVacantesCatalogo(res.data);
      })
      .catch(() => {
        // Silencioso: el multiselect simplemente queda sin opciones; no bloquea la página.
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Refleja los filtros/orden/página en la URL (reemplaza, no apila historial).
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (estadoFiltro.length > 0) params.set('estado', estadoFiltro.join(','));
    if (vacanteFiltro.length > 0) params.set('vacante', vacanteFiltro.join(','));
    if (searchDebounced) params.set('q', searchDebounced);
    if (avance) params.set('avance', avance);
    if (docs) params.set('docs', docs);
    if (fechaDesde) params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params.set('fechaHasta', fechaHasta);
    if (actividadAntesDe) params.set('actividadAntesDe', actividadAntesDe);
    if (ordenarPor) params.set('sort', `${ordenarPor}:${direccion}`);
    if (vista === 'papelera') params.set('vista', 'papelera');
    if (vista === 'papelera' && origenEliminacion) params.set('origen', origenEliminacion);
    const qs = params.toString();
    router.replace(qs ? `/candidatos?${qs}` : '/candidatos', { scroll: false });
  }, [
    page,
    estadoFiltro,
    vacanteFiltro,
    searchDebounced,
    avance,
    docs,
    fechaDesde,
    fechaHasta,
    actividadAntesDe,
    ordenarPor,
    direccion,
    vista,
    origenEliminacion,
    router,
  ]);

  // Vuelve a la página 1 cuando cambian filtros/orden (pero no en el montaje inicial).
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    setPage(1);
  }, [
    estadoFiltro,
    vacanteFiltro,
    searchDebounced,
    avance,
    docs,
    fechaDesde,
    fechaHasta,
    actividadAntesDe,
    ordenarPor,
    direccion,
    vista,
    origenEliminacion,
  ]);

  /** Filtros compartidos por /candidatos, /resumen y /exportar. `estado` es opcional porque /resumen nunca lo manda (ver KPIs). */
  const construirFiltros = useCallback(
    (incluirEstado: boolean): Record<string, string> => {
      const params: Record<string, string> = {};
      if (incluirEstado && estadoFiltro.length > 0) params.estado = estadoFiltro.join(',');
      if (vacanteFiltro.length > 0) params.vacante = vacanteFiltro.join(',');
      if (searchDebounced) params.q = searchDebounced;
      if (avance) params.avance = avance;
      if (docs) params.docs = docs;
      if (fechaDesde) params.fechaDesde = fechaDesde;
      if (fechaHasta) params.fechaHasta = fechaHasta;
      if (actividadAntesDe) params.actividadAntesDe = actividadAntesDe;
      if (vista === 'papelera') {
        params.vista = vista;
        if (origenEliminacion) params.origenEliminacion = origenEliminacion;
      }
      return params;
    },
    [estadoFiltro, vacanteFiltro, searchDebounced, avance, docs, fechaDesde, fechaHasta, actividadAntesDe, vista, origenEliminacion],
  );

  const cargar = useCallback(async () => {
    try {
      setRefreshing(true);
      setError('');
      const paramsLista: Record<string, string | number> = {
        ...construirFiltros(true),
        page,
        limit: LIMIT,
      };
      if (ordenarPor) {
        paramsLista.ordenarPor = ordenarPor;
        paramsLista.direccion = direccion;
      }
      // El desglose por estado (KPIs) nunca manda `estado`: así no colapsa a un
      // solo bucket cuando la tabla ya está filtrada por estado.
      const paramsResumen = construirFiltros(false);

      const [listaRes, resumenRes] = await Promise.all([
        api.get<CandidatosPaginados>('/evaluaciones/candidatos', { params: paramsLista }),
        api.get<ResumenCandidatos>('/evaluaciones/candidatos/resumen', { params: paramsResumen }),
      ]);
      setPaginado(listaRes.data);
      setResumen(resumenRes.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      console.error('[candidatos] fallo al cargar', err);
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [construirFiltros, page, ordenarPor, direccion]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const items = paginado?.data ?? [];

  const toggleOrden = (campo: CampoOrden) => {
    if (ordenarPor !== campo) {
      setOrdenarPor(campo);
      setDireccion('asc');
    } else {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  const toggleEstado = (valor: EstadoGeneral) => {
    setEstadoFiltro((prev) => (prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]));
  };

  const toggleVacante = (valor: string) => {
    setVacanteFiltro((prev) => (prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]));
  };

  const limpiarFiltros = () => {
    setSearch('');
    setVacanteFiltro([]);
    setEstadoFiltro([]);
    setAvance('');
    setDocs('');
    setFechaDesde('');
    setFechaHasta('');
    setActividadAntesDe('');
  };

  const exportarCSV = async () => {
    setExportando(true);
    setError('');
    try {
      // El CSV se genera en el servidor (mismos filtros, sin paginar) y
      // queda auditado ahí: quién exportó, con qué filtros y cuántas filas.
      const params = construirFiltros(true);
      const res = await api.get<Blob>('/evaluaciones/candidatos/exportar', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `candidatos_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setExportando(false);
    }
  };

  return {
    esAdmin,
    items,
    paginado,
    resumen,
    vacantesCatalogo,
    loading,
    refreshing,
    error,
    reintentar: cargar,
    exportando,
    exportarCSV,

    page,
    setPage,
    search,
    setSearch,
    vacanteFiltro,
    toggleVacante,
    estadoFiltro,
    setEstadoFiltro,
    toggleEstado,
    avance,
    setAvance,
    docs,
    setDocs,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    actividadAntesDe,
    setActividadAntesDe,
    limpiarFiltros,

    ordenarPor,
    direccion,
    toggleOrden,
    vista,
    setVista,
    origenEliminacion,
    setOrigenEliminacion,
  };
}

export type UseCandidatosQueryReturn = ReturnType<typeof useCandidatosQuery>;
