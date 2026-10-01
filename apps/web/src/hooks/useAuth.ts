'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { session } from '@/lib/auth/session';
import { cerrarSesion, refrescarSesion } from '@/lib/auth/refrescarSesion';
import { ROLE_HOME } from '@/lib/auth/roleHome';

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    rol: string;
    nombre: string;
    apellidos: string;
  } | null>(null);

  // Al montar, intenta renovar el access token con el refresh cookie (la
  // misma petición compartida que usan el interceptor y los layouts). Solo
  // un 401 limpia la sesión; eso lo hace refrescarSesion.
  const initSession = useCallback(async () => {
    try {
      await refrescarSesion();
    } catch {
      // 401: sesión ya limpiada; 429 o red: se conserva para reintentar luego.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{
        requiresPasswordChange: boolean;
        requiresMfa?: boolean;
        requiresMfaSetup?: boolean;
        tempSessionToken?: string;
        accessToken?: string;
        user: { id: string; email: string; rol: string; nombre: string; apellidos: string };
      }>('/auth/login', { email, password });

      if (data.requiresPasswordChange) {
        sessionStorage.setItem('force_change_email', data.user.email);
        router.push('/cambiar-contrasena');
        return;
      }

      if (data.requiresMfa) {
        if (!data.tempSessionToken) {
          throw new Error('No se recibió tempSessionToken para MFA');
        }
        sessionStorage.setItem('mfa_temp_session', data.tempSessionToken);
        sessionStorage.setItem('mfa_setup_required', data.requiresMfaSetup ? '1' : '0');
        sessionStorage.setItem('mfa_user_role', data.user.rol);
        router.push('/login/mfa');
        return;
      }

      if (!data.accessToken) {
        throw new Error('No se recibió accessToken');
      }

      sessionStorage.removeItem('mfa_temp_session');
      sessionStorage.removeItem('mfa_setup_required');
      sessionStorage.removeItem('mfa_user_role');

      session.set(data.accessToken, data.user.rol);
      setUser(data.user);
      router.push(ROLE_HOME[data.user.rol] ?? '/');
    },
    [router],
  );

  // Siempre limpia la sesión local y va a /login, aunque el servidor falle.
  const logout = useCallback(async () => {
    setUser(null);
    await cerrarSesion();
  }, []);

  return { user, loading, login, logout };
}
