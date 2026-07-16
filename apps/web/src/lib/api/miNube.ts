import api from "./client";

export type DocumentoNubeTipo = "folder" | "file";

export type UsuarioResumen = {
  id: string;
  nombre: string;
  email: string;
};

export type DocumentoNubeItem = {
  id: string;
  nombre: string;
  tipo: DocumentoNubeTipo;
  parentId: string | null;
  ownerId: string | null;
  owner: UsuarioResumen | null;
  mimeType: string | null;
  size: number;
  extension: string | null;
  isDeleted: boolean;
  createdBy: UsuarioResumen | null;
  updatedBy: UsuarioResumen | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentoNubeListado = {
  parentId: string | null;
  items: DocumentoNubeItem[];
};

export const miNubeApi = {
  async listar(parentId?: string | null) {
    const { data } = await api.get<DocumentoNubeListado>("/mi-nube", {
      params: parentId ? { parentId } : undefined,
    });
    return data;
  },

  async buscar(q: string) {
    const { data } = await api.get<DocumentoNubeItem[]>("/mi-nube/search", {
      params: { q },
    });
    return data;
  },

  async crearCarpeta(nombre: string, parentId?: string | null) {
    const { data } = await api.post<DocumentoNubeItem>("/mi-nube/folder", {
      nombre,
      parentId: parentId ?? undefined,
    });
    return data;
  },

  async subirArchivo(
    file: File,
    parentId?: string | null,
    onProgress?: (progress: number) => void,
  ) {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await api.post<DocumentoNubeItem>(
      "/mi-nube/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        params: parentId ? { parentId } : undefined,
        onUploadProgress: (event) => {
          if (!event.total || !onProgress) return;
          onProgress(Math.round((event.loaded * 100) / event.total));
        },
      },
    );
    return data;
  },

  async descargarBlob(id: string) {
    const response = await api.get<Blob>(`/mi-nube/download/${id}`, {
      responseType: "blob",
    });
    return response.data;
  },

  async verBlob(id: string) {
    const response = await api.get<Blob>(`/mi-nube/view/${id}`, {
      responseType: "blob",
    });
    return response.data;
  },

  async renombrar(id: string, nombre: string) {
    const { data } = await api.patch<DocumentoNubeItem>(
      `/mi-nube/${id}/rename`,
      {
        nombre,
      },
    );
    return data;
  },

  async mover(id: string, parentId?: string | null) {
    const { data } = await api.patch<DocumentoNubeItem>(`/mi-nube/${id}/move`, {
      parentId: parentId ?? undefined,
    });
    return data;
  },

  async eliminar(id: string) {
    const { data } = await api.delete<{ message: string }>(`/mi-nube/${id}`);
    return data;
  },
};
