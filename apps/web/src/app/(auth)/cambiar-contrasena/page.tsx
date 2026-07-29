'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import PasswordInput from '@/components/ui/PasswordInput';

const schema = z
  .object({
    email: z.string().email('Correo inválido'),
    passwordTemporal: z.string().min(1, 'La contraseña temporal es obligatoria'),
    nuevaPassword: z
      .string()
      .min(10, 'Mínimo 10 caracteres')
      .max(72, 'Máximo 72 caracteres')
      .regex(/[a-z]/, 'Debe contener una minúscula')
      .regex(/[A-Z]/, 'Debe contener una mayúscula')
      .regex(/\d/, 'Debe contener un número'),
    confirmar: z.string(),
  })
  .refine((d) => d.nuevaPassword === d.confirmar, {
    path: ['confirmar'],
    message: 'Las contraseñas no coinciden',
  });

type FormValues = z.infer<typeof schema>;

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      passwordTemporal: '',
      nuevaPassword: '',
      confirmar: '',
    },
  });

  useEffect(() => {
    const email = sessionStorage.getItem('force_change_email') ?? '';
    if (email) setValue('email', email);
  }, [setValue]);

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true);
      setServerError('');
      await api.post('/auth/cambiar-contrasena-obligatoria', {
        email: data.email,
        passwordTemporal: data.passwordTemporal,
        nuevaPassword: data.nuevaPassword,
      });

      sessionStorage.removeItem('force_change_email');
      await Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: 'Ahora inicia sesión con tu nueva contraseña.',
      });
      router.push('/login');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg = axiosErr.response?.data?.message ?? 'No se pudo cambiar la contraseña';
      setServerError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="text-center mb-3">
          <i className="bi bi-key-fill mb-2 d-block" style={{ fontSize: '2rem', color: 'var(--enmv-azul)' }} />
          <p className="nombre-escuela mb-0">Cambio obligatorio de contraseña</p>
          <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.8rem' }}>
            Ingresa tu contraseña temporal y define una nueva segura.
          </p>
          <div className="auth-divider" />
        </div>

        {serverError && <Alert variant="danger">{serverError}</Alert>}

        <Form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Form.Group className="mb-3">
            <Form.Label>Correo</Form.Label>
            <Form.Control type="email" {...register('email')} isInvalid={!!errors.email} />
            <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Contraseña temporal</Form.Label>
            <PasswordInput
              {...register('passwordTemporal')}
              isInvalid={!!errors.passwordTemporal}
            />
            <Form.Control.Feedback type="invalid">
              {errors.passwordTemporal?.message}
            </Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Nueva contraseña</Form.Label>
            <PasswordInput
              {...register('nuevaPassword')}
              isInvalid={!!errors.nuevaPassword}
            />
            <Form.Control.Feedback type="invalid">
              {errors.nuevaPassword?.message}
            </Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label>Confirmar nueva contraseña</Form.Label>
            <PasswordInput
              {...register('confirmar')}
              isInvalid={!!errors.confirmar}
            />
            <Form.Control.Feedback type="invalid">
              {errors.confirmar?.message}
            </Form.Control.Feedback>
          </Form.Group>

          <Button type="submit" className="w-100 btn-primary" disabled={loading} style={{ padding: '0.65rem', fontWeight: 600 }}>
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Guardando...
              </>
            ) : (
              'Actualizar contraseña'
            )}
          </Button>
        </Form>
      </div>
    </div>
  );
}
