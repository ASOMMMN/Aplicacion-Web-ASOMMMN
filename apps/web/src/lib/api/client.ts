import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { MENSAJES_FALLO_SESION, refrescarSesion, tokenActual } from '@/lib/auth/refrescarSesion';
import { CODIGO_CONSENTIMIENTO_PENDIENTE } from '@/lib/privacidad/avisoPrivacidad';
import { marcarConsentimientoPendiente } from '@/lib/privacidad/consentimientoPendiente';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL no está configurada.');
}

const api = axios.create({
  baseURL: apiUrl,
  withCredentials: true, // envía la cookie refresh_token automáticamente
});

type ConfigConToken = InternalAxiosRequestConfig & {
  /** Token con el que salió la petición (null = sin token). */
  _tokenEnviado?: string | null;
  _retry?: boolean;
};

// Inyecta el access token en cada petición
api.interceptors.request.use((config: ConfigConToken) => {
  const token = tokenActual();
  config._tokenEnviado = token;
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

/** El mensaje genérico del Throttler se reemplaza; los propios (p. ej. IA) se conservan. */
function conMensajeDeLimite(error: AxiosError<{ message?: unknown }>) {
  const data = error.response?.data;
  const mensaje = typeof data?.message === 'string' ? data.message : '';
  if (error.response && (!mensaje || /ThrottlerException|Too Many Requests/i.test(mensaje))) {
    error.response.data = { ...data, message: MENSAJES_FALLO_SESION.limite };
  }
  return error;
}

/** 403 de la API mientras el postulante no acepta el aviso de privacidad vigente. */
function esConsentimientoPendiente(error: AxiosError<{ message?: unknown }>) {
  const data = error.response?.data as { codigo?: unknown } | undefined;
  return error.response?.status === 403 && data?.codigo === CODIGO_CONSENTIMIENTO_PENDIENTE;
}

// Renueva el access token cuando expira. Nunca reintenta ante un 429 ni en
// /auth/* (login, refresh, logout… no deben disparar otro refresh).
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: unknown }>) => {
    const original = error.config as ConfigConToken | undefined;
    const status = error.response?.status;
    if (status === 429) return Promise.reject(conMensajeDeLimite(error));
    // El layout del postulante muestra el modal bloqueante (P-01).
    if (esConsentimientoPendiente(error)) marcarConsentimientoPendiente(true);
    if (status !== 401 || !original || original._retry || (original.url ?? '').includes('/auth/')) {
      return Promise.reject(error);
    }
    original._retry = true;

    // Salió sin token (p. ej. justo tras recargar) y otra parte de la página
    // ya renovó la sesión: basta reenviarla, sin otro /auth/refresh.
    const actual = tokenActual();
    const token =
      actual && actual !== original._tokenEnviado
        ? actual
        : (await refrescarSesion()).accessToken; // ErrorSesion se propaga con su mensaje
    original.headers['Authorization'] = `Bearer ${token}`;
    return api(original);
  },
);

export default api;
