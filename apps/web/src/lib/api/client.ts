import axios from 'axios';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL no está configurada.');
}

const api = axios.create({
  baseURL: apiUrl,
  withCredentials: true, // envía la cookie refresh_token automáticamente
});

// Inyecta el access token en cada petición
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // La sesión es un singleton; importamos dinámicamente para evitar
    // el problema de módulos circulares entre client.ts ↔ session.ts
    // La forma limpia es un módulo de token que solo exporta get/set.
    const token = (window as Window & { __asommmn_token?: string | null }).__asommmn_token as string | undefined;
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Renueva el access token transparentemente cuando expira
let isRefreshing = false;
let pendingQueue: Array<{
  
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const url: string = original?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: (token) => {
              original.headers['Authorization'] = `Bearer ${token}`;
              resolve(api(original));
            },
            reject,
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
        const newToken = data.accessToken;
        (window as Window & { __asommmn_token?: string | null }).__asommmn_token = newToken;
        pendingQueue.forEach(({ resolve }) => resolve(newToken));
        pendingQueue = [];
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        pendingQueue.forEach(({ reject }) => reject(refreshError));
        pendingQueue = [];
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
