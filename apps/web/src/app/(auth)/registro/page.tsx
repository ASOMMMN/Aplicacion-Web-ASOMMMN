'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { registerSchema, RegisterForm } from '@/lib/validators/auth';
import AuthVideoBackground from '@/components/auth/AuthVideoBackground';
import EscudoAsociacionAuth from '@/components/auth/EscudoAsociacionAuth';

export default function RegistroPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setServerError('');
    try {
      await api.post('/auth/registro', {
        nombre: data.nombre,
        apellidos: data.apellidos,
        email: data.email,
        password: data.password,
      });

      await Swal.fire({
        icon: 'success',
        title: '¡Cuenta creada!',
        text: 'Puedes iniciar sesión de inmediato con tu correo y contraseña.',
        confirmButtonText: 'Ir al login',
        confirmButtonColor: '#0A2240',
      });
      router.push('/login');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg =
        axiosErr.response?.data?.message ?? 'Error al registrarse. Inténtalo de nuevo.';
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
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <div className="text-center mb-3">
            <EscudoAsociacionAuth />
            <div className="auth-divider" />
            <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>
              Registro de postulante
            </p>
          </div>

          {serverError && (
            <Alert variant="danger" className="py-2 small">
              {serverError}
            </Alert>
          )}

          <Form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Row>
              <Col sm={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Nombre(s)</Form.Label>
                  <Form.Control
                    {...register('nombre')}
                    isInvalid={!!errors.nombre}
                    autoComplete="given-name"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.nombre?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Apellidos</Form.Label>
                  <Form.Control
                    {...register('apellidos')}
                    isInvalid={!!errors.apellidos}
                    autoComplete="family-name"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.apellidos?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
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

            <Form.Group className="mb-3">
              <Form.Label>Contraseña</Form.Label>
              <Form.Control
                type="password"
                {...register('password')}
                isInvalid={!!errors.password}
                autoComplete="new-password"
              />
              <Form.Control.Feedback type="invalid">
                {errors.password?.message}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                Mínimo 8 caracteres, al menos una letra y un número.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>Confirmar contraseña</Form.Label>
              <Form.Control
                type="password"
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
                  Creando cuenta…
                </>
              ) : (
                <>
                  <i className="bi bi-person-plus me-2" />
                  Registrarme
                </>
              )}
            </Button>
          </Form>

          <hr className="my-3" style={{ borderColor: 'var(--enmv-dorado)', opacity: 0.4 }} />
          <p className="text-center small mb-0" style={{ color: 'var(--enmv-text-muted)' }}>
            ¿Ya tienes cuenta?{' '}
            <Link
              href="/login"
              className="text-decoration-none fw-semibold"
              style={{ color: 'var(--enmv-azul)' }}
            >
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

function toErrorMessage(msg: unknown): string {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg) {
    return toErrorMessage((msg as { message?: unknown }).message);
  }
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
}
