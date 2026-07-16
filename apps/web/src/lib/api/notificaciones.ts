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
