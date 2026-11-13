import api from "./client";

export type NotificacionItem = {
  _id: string;
  tipo: "curso_por_vencer";
  candidatoId: string;
  cursoId: string;
  nombreCandidato: string;
  nombreCurso: string;
  fechaVencimiento: string;
  diasAnticipacion: number;
  diasRestantes: number;
  leida: boolean;
  fechaCreacion: string;
};

export const notificacionesApi = {
  async listar(soloNoLeidas?: boolean) {
    const { data } = await api.get<NotificacionItem[]>("/notificaciones", {
      params: soloNoLeidas ? { leida: "false" } : undefined,
    });
    return data;
  },

  async contarNoLeidas() {
    const { data } = await api.get<{ count: number }>(
      "/notificaciones/no-leidas/contador",
    );
    return data;
  },

  async marcarLeida(id: string) {
    const { data } = await api.patch<{ message: string }>(
      `/notificaciones/${id}/leida`,
    );
    return data;
  },

  async marcarTodasLeidas() {
    const { data } = await api.patch<{ message: string }>(
      "/notificaciones/marcar-todas-leidas",
    );
    return data;
  },

  async revisarAhora() {
    const { data } = await api.post<{ creadas: number }>(
      "/notificaciones/revisar-ahora",
    );
    return data;
  },
};

// ── Campanita de candidatos (lectura por usuario) ──

export type TipoNotificacionApp =
  | "nuevo_candidato"
  | "expediente_completo"
  | "documento_subido"
  | "expediente_evaluado"
  | "candidato_inactivo";

export type DecisionExpediente = "en_proceso" | "completado" | "rechazado";

export type NotificacionAppItem = {
  _id: string;
  tipo: TipoNotificacionApp;
  candidatoId: string;
  nombreCandidato: string;
  mensaje: string;
  enlace: string;
  fecha: string;
  /** Leída por mí (cada evaluador/admin tiene su propio estado). */
  leida: boolean;
  /** Eventos que junta (documento_subido); 1 en los demás. */
  cantidad?: number;
  documentos?: string[];
  decision?: DecisionExpediente;
  actorNombre?: string;
  diasInactivo?: number;
};

/** Avisos del mismo tipo y día ("5 postulantes nuevos hoy"). */
export type GrupoNotificacionesApp = {
  clave: string;
  tipo: TipoNotificacionApp;
  /** AAAA-MM-DD en hora de México. */
  dia: string;
  cantidad: number;
  noLeidas: number;
  resumen: string;
  fecha: string;
  items: NotificacionAppItem[];
  /** Hay más avisos de los que trae `items` (pedir con tipo + dia). */
  hayMas: boolean;
};

export type ListaNotificacionesApp = {
  items: NotificacionAppItem[];
  total: number;
  /** Todas mis no leídas, sin filtro (insignia). */
  noLeidas: number;
  pagina: number;
  limite: number;
  grupos?: GrupoNotificacionesApp[];
  totalGrupos?: number;
};

export type FiltroNotificacionesApp = {
  tipo?: TipoNotificacionApp;
  dia?: string;
};

export type ParametrosListarNotificacionesApp = FiltroNotificacionesApp & {
  pagina?: number;
  limite?: number;
  soloNoLeidas?: boolean;
  agrupar?: "dia";
};

/** Solo manda los parámetros con valor (sin `soloNoLeidas=false`). */
function limpiar<T extends Record<string, unknown>>(params?: T) {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== false && v !== ""),
  );
}

export const notificacionesAppApi = {
  async listarMias(params?: ParametrosListarNotificacionesApp) {
    const { data } = await api.get<ListaNotificacionesApp>(
      "/notificaciones/mias",
      { params: limpiar(params) },
    );
    return data;
  },

  async marcarLeida(id: string) {
    const { data } = await api.patch<{ message: string }>(
      `/notificaciones/mias/${encodeURIComponent(id)}/leida`,
    );
    return data;
  },

  /** Todas las mías, o solo las de un tipo y/o día (un grupo). */
  async marcarTodasLeidas(filtro?: FiltroNotificacionesApp) {
    const { data } = await api.patch<{ message: string; actualizadas: number }>(
      "/notificaciones/mias/marcar-todas-leidas",
      undefined,
      { params: limpiar(filtro) },
    );
    return data;
  },
};
