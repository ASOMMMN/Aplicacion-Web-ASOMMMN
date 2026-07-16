'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import Link from 'next/link';
import api from '@/lib/api/client';
import { forgotPasswordSchema, ForgotPasswordForm } from '@/lib/validators/auth';
import AuthVideoBackground from '@/components/auth/AuthVideoBackground';

export default function RecuperarContrasenaPage() {
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setLoading(true);
    setServerError('');
    try {
      await api.post('/auth/recuperar-contrasena', data);
      setSent(true);
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
            <p className="nombre-escuela mb-0">Recuperar contraseña</p>
            <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.8rem' }}>
              Te enviaremos una contraseña temporal a tu correo, y te pediremos
              cambiarla al iniciar sesión.
            </p>
            <div className="auth-divider" />
          </div>

          {sent ? (
            <Alert variant="success">
              Si el correo está registrado, recibirás una contraseña temporal en
              breve. Revisa también tu carpeta de spam.
            </Alert>
          ) : (
            <>
              {serverError && (
                <Alert variant="danger" className="py-2 small">
                  {serverError}
                </Alert>
              )}
              <Form onSubmit={handleSubmit(onSubmit)} noValidate>
                <Form.Group className="mb-4">
                  <Form.Label>Correo electrónico</Form.Label>
                  <Form.Control
                    type="email"
                    {...register('email')}
                    isInvalid={!!errors.email}
                    autoComplete="email"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.email?.message}
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
                      Enviando…
                    </>
                  ) : (
                    'Enviar contraseña temporal'
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
