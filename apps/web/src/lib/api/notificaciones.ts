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

// ── Campanita: nuevo candidato / expediente completo (lectura por usuario) ──

export type TipoNotificacionApp = "nuevo_candidato" | "expediente_completo";

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
};

export type ListaNotificacionesApp = {
  items: NotificacionAppItem[];
  total: number;
  noLeidas: number;
  pagina: number;
  limite: number;
};

export const notificacionesAppApi = {
  async listarMias(params?: { pagina?: number; limite?: number }) {
    const { data } = await api.get<ListaNotificacionesApp>(
      "/notificaciones/mias",
      { params },
    );
    return data;
  },

  async marcarLeida(id: string) {
    const { data } = await api.patch<{ message: string }>(
      `/notificaciones/mias/${encodeURIComponent(id)}/leida`,
    );
    return data;
  },

  async marcarTodasLeidas() {
    const { data } = await api.patch<{ message: string; actualizadas: number }>(
      "/notificaciones/mias/marcar-todas-leidas",
    );
    return data;
  },
};
