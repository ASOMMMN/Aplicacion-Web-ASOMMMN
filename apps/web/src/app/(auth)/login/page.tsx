'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { loginSchema, LoginForm } from '@/lib/validators/auth';
import AuthVideoBackground from '@/components/auth/AuthVideoBackground';
import EscudoAsociacionAuth from '@/components/auth/EscudoAsociacionAuth';
import PasswordInput from '@/components/ui/PasswordInput';

const ROLE_HOME: Record<string, string> = {
  postulante: '/dashboard',
  evaluador: '/candidatos',
  administrador: '/usuarios',
};

function toErrorMessage(msg: unknown): string {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg) {
    return toErrorMessage((msg as { message?: unknown }).message);
  }
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
}

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setServerError('');
    try {
      const res = await api.post<{
        requiresPasswordChange: boolean;
        requiresMfa?: boolean;
        requiresMfaSetup?: boolean;
        tempSessionToken?: string;
        accessToken?: string;
        user: { id: string; email: string; rol: string; nombre: string };
        message?: string;
      }>('/auth/login', data);

      if (res.data.requiresPasswordChange) {
        sessionStorage.setItem('force_change_email', res.data.user.email);
        await Swal.fire({
          icon: 'info',
          title: 'Cambio de contraseña requerido',
          text:
            res.data.message ??
            'Debes cambiar tu contraseña temporal antes de acceder al sistema.',
        });
        router.push('/cambiar-contrasena');
        return;
      }

      if (res.data.requiresMfa) {
        if (!res.data.tempSessionToken) {
          throw new Error('No se recibió tempSessionToken para MFA');
        }

        sessionStorage.setItem('mfa_temp_session', res.data.tempSessionToken);
        sessionStorage.setItem(
          'mfa_setup_required',
          res.data.requiresMfaSetup ? '1' : '0',
        );
        sessionStorage.setItem('mfa_user_role', res.data.user.rol);

        router.push('/login/mfa');
        return;
      }

      // eslint-disable-next-line react-hooks/immutability
      (window as Window & { __asommmn_token?: string | null }).__asommmn_token =
        res.data.accessToken ?? null;
      sessionStorage.removeItem('mfa_temp_session');
      sessionStorage.removeItem('mfa_setup_required');
      sessionStorage.removeItem('mfa_user_role');
      // eslint-disable-next-line react-hooks/immutability
      document.cookie = `user_role=${res.data.user.rol}; path=/; SameSite=Strict`;

      router.push(ROLE_HOME[res.data.user.rol] ?? '/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      const msg = axiosErr.response?.data?.message ?? axiosErr.message ?? 'Error al iniciar sesión. Inténtalo de nuevo.';
      setServerError(toErrorMessage(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AuthVideoBackground />
      <div
        className="auth-page"
        style={{
          background: 'transparent',
          backgroundImage: 'none',
          position: 'relative',
          zIndex: 3,
        }}
      >
        <div className="auth-card">
          {/* Escudo + nombre de la Asociación */}
          <div className="text-center mb-3">
            <EscudoAsociacionAuth />
            <div className="auth-divider" />
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Sistema de Evaluación Curricular — Inicio de sesión
            </p>
          </div>

          {serverError && (
            <Alert variant="danger" className="py-2 small">
              {serverError}
            </Alert>
          )}

          <Form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                Correo electrónico
              </Form.Label>
              <Form.Control
                type="email"
                placeholder="tu@correo.com"
                {...register('email')}
                isInvalid={!!errors.email}
                autoComplete="email"
              />
              <Form.Control.Feedback type="invalid">
                {errors.email?.message}
              </Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-4">
              <div className="d-flex justify-content-between align-items-center">
                <Form.Label className="mb-0" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  Contraseña
                </Form.Label>
                <Link
                  href="/recuperar-contrasena"
                  className="text-decoration-none small"
                  style={{ color: 'var(--enmv-dorado)', fontSize: '0.8rem' }}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <PasswordInput
                {...register('password')}
                isInvalid={!!errors.password}
                autoComplete="current-password"
                className="mt-1"
              />
              <Form.Control.Feedback type="invalid">
                {errors.password?.message}
              </Form.Control.Feedback>
            </Form.Group>

            <Button
              type="submit"
              className="w-100 btn-primary"
              disabled={loading}
              style={{ padding: '0.65rem', fontSize: '0.95rem', fontWeight: 600 }}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Iniciando…
                </>
              ) : (
                <>
                  <i className="bi bi-shield-lock me-2" />
                  Iniciar sesión
                </>
              )}
            </Button>
          </Form>

          <hr className="my-3" style={{ borderColor: 'var(--enmv-dorado)', opacity: 0.4 }} />
          <p className="text-center small mb-0" style={{ color: 'var(--enmv-text-muted)' }}>
            ¿No tienes cuenta?{' '}
            <Link
              href="/registro"
              className="text-decoration-none fw-semibold"
              style={{ color: 'var(--enmv-azul)' }}
            >
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
