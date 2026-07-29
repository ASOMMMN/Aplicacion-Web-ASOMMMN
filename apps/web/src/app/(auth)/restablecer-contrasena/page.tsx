'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, useRouter } from 'next/navigation';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import Link from 'next/link';
import api from '@/lib/api/client';
import { resetPasswordSchema, ResetPasswordForm } from '@/lib/validators/auth';
import AuthVideoBackground from '@/components/auth/AuthVideoBackground';
import PasswordInput from '@/components/ui/PasswordInput';

function RestablecerContrasenaContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (data: ResetPasswordForm) => {
    setLoading(true);
    setServerError('');
    try {
      await api.post('/auth/restablecer-contrasena', {
        token: data.token,
        nuevaPassword: data.password,
      });
      setDone(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg = axiosErr.response?.data?.message ?? 'Error. Inténtalo de nuevo.';
      setServerError(Array.isArray(msg) ? msg.join(', ') : String(msg));
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
          <div className="text-center mb-3">
            <i className="bi bi-shield-lock-fill mb-2 d-block" style={{ fontSize: '2rem', color: 'var(--enmv-azul)' }} />
            <p className="nombre-escuela mb-0">Restablecer contraseña</p>
            <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.8rem' }}>
              Define tu nueva contraseña.
            </p>
            <div className="auth-divider" />
          </div>

          {done ? (
            <>
              <Alert variant="success">
                Contraseña actualizada correctamente. Ya puedes iniciar sesión.
              </Alert>
              <Button className="btn-primary w-100" onClick={() => router.push('/login')}>
                Ir al login
              </Button>
            </>
          ) : !token ? (
            <Alert variant="danger">
              Token no encontrado en la URL. Solicita un nuevo enlace de
              recuperación.
            </Alert>
          ) : (
            <>
              {serverError && (
                <Alert variant="danger" className="py-2 small">
                  {serverError}
                </Alert>
              )}
              <Form onSubmit={handleSubmit(onSubmit)} noValidate>
                <input type="hidden" {...register('token')} />

                <Form.Group className="mb-3">
                  <Form.Label>Nueva contraseña</Form.Label>
                  <PasswordInput
                    {...register('password')}
                    isInvalid={!!errors.password}
                    autoComplete="new-password"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.password?.message}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Mínimo 10 caracteres, con mayúsculas, minúsculas y números.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Confirmar contraseña</Form.Label>
                  <PasswordInput
                    {...register('confirmar')}
                    isInvalid={!!errors.confirmar}
                    autoComplete="new-password"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.confirmar?.message}
                  </Form.Control.Feedback>
                </Form.Group>

                <Button
                  type="submit"
                  className="w-100 btn-primary"
                  disabled={loading}
                  style={{ padding: '0.65rem', fontWeight: 600 }}
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Guardando…
                    </>
                  ) : (
                    'Restablecer contraseña'
                  )}
                </Button>
              </Form>
            </>
          )}

          <hr className="my-3" style={{ borderColor: 'var(--enmv-dorado)', opacity: 0.4 }} />
          <p className="text-center small mb-0">
            <Link href="/login" className="text-decoration-none fw-semibold" style={{ color: 'var(--enmv-azul)' }}>
              ← Volver al login
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

export default function RestablecerContrasenaPage() {
  return (
    <Suspense
      fallback={
        <div className="d-flex align-items-center justify-content-center min-vh-100">
          <Spinner animation="border" />
        </div>
      }
    >
      <RestablecerContrasenaContent />
    </Suspense>
  );
}
