'use client';

/**
 * Renovación y cierre de sesión compartidos por el cliente HTTP, los layouts
 * protegidos y useAuth.
 *
 * - refrescarSesion(): una sola petición a /auth/refresh a la vez; quien
 *   llegue mientras hay una en curso espera esa misma. Antes, el layout y el
 *   interceptor renovaban en paralelo con la misma cookie; la rotación del
 *   backend invalida la cookie en el primer uso y el segundo recibía 401
 *   ("Sesión expirada").
 * - Solo un 401 de /auth/refresh termina la sesión: se limpia la sesión
 *   local (token y cookie user_role) y se redirige una vez a /login. Un 429
 *   o un error de red no limpian nada ni redirigen: se informa y no se
 *   reintenta.
 * - cerrarSesion(): siempre limpia lo local, aunque el servidor falle.
 *
 * Usa un cliente sin interceptores para que /auth/refresh y /auth/logout
 * nunca disparen otro refresh.
 */
import axios from 'axios';
import { session } from './session';
import { esRutaPublica } from './rutasPublicas';

const authClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // la cookie httpOnly refresh_token
});

export type MotivoFalloSesion = 'expirada' | 'limite' | 'red' | 'servidor';

export const MENSAJES_FALLO_SESION: Record<MotivoFalloSesion, string> = {
  expirada: 'Tu sesión expiró. Inicia sesión de nuevo.',
  limite: 'Demasiadas solicitudes, espera un momento',
  red: 'Sin conexión, intenta de nuevo',
  servidor: 'No se pudo renovar la sesión, intenta de nuevo',
};

export class ErrorSesion extends Error {
  constructor(readonly motivo: MotivoFalloSesion) {
    super(MENSAJES_FALLO_SESION[motivo]);
    this.name = 'ErrorSesion';
  }
}

export interface SesionRenovada {
  accessToken: string;
  rol: string;
}

type VentanaConToken = Window & { __asommmn_token?: string | null };

/** Access token en memoria (null tras recargar la página). */
export const tokenActual = (): string | null =>
  typeof window === 'undefined' ? null : ((window as VentanaConToken).__asommmn_token ?? null);

function motivoDe(err: unknown): MotivoFalloSesion {
  if (!axios.isAxiosError(err) || !err.response) return 'red';
  if (err.response.status === 401) return 'expirada';
  if (err.response.status === 429) return 'limite';
  return 'servidor';
}

let redirigiendo = false;

/** Una sola redirección a /login; nunca desde una página pública (evita bucles). */
function irAlLogin() {
  if (redirigiendo || esRutaPublica(window.location.pathname)) return;
  redirigiendo = true;
  window.location.replace('/login');
}

let enCurso: Promise<SesionRenovada> | null = null;

export function refrescarSesion(): Promise<SesionRenovada> {
  enCurso ??= authClient
    .post<SesionRenovada>('/auth/refresh')
    .then(
      ({ data }) => {
        // Rol actual en BD: si cambió desde el login, el proxy deja de usar el viejo.
        session.set(data.accessToken, data.rol);
        return data;
      },
      (err: unknown) => {
        const motivo = motivoDe(err);
        if (motivo === 'expirada') {
          session.clear();
          irAlLogin();
        }
        throw new ErrorSesion(motivo);
      },
    )
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

/** Cierra la sesión en el servidor si puede; lo local se limpia siempre. */
export async function cerrarSesion(): Promise<void> {
  try {
    await authClient.post('/auth/logout');
  } catch {
    // Sin red, 429 o 5xx: la sesión local se cierra igual.
  } finally {
    session.clear();
    redirigiendo = true;
    window.location.replace('/login');
  }
}
