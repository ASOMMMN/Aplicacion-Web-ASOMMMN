'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { IconAncla, SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';

// Schema Zod
const perfilSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').readonly(),
  apellidos: z.string().min(1, 'Apellidos requeridos').readonly(),
  email: z.string().email('Email inválido').readonly(),
  telefono: z.string().optional().refine((val) => !val || /^[+\d\s\-()]{10,15}$/.test(val), {
    message: 'Teléfono inválido (10-15 caracteres)',
  }),
  fechaNacimiento: z.string().optional().refine((val) => {
    if (!val) return true;
    const date = new Date(val);
    const age = new Date().getFullYear() - date.getFullYear();
    return age >= 18;
  }, { message: 'Debes tener al menos 18 años' }),
  ciudad: z.string().optional(),
  pais: z.string().optional(),
  linkedinUrl: z.string().optional().refine(
    (val) => !val || /^https:\/\/linkedin\.com\/in\/.+/.test(val),
    { message: 'URL de LinkedIn inválida' }
  ),
  vacante: z.string().min(1, 'La vacante es obligatoria').max(200, 'Máximo 200 caracteres'),
});

type PerfilForm = z.infer<typeof perfilSchema>;

interface Perfil {
  usuarioId: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  fechaNacimiento?: string;
  ciudad?: string;
  pais?: string;
  linkedinUrl?: string;
  vacante?: string;
}

const toErrorMessage = (msg: unknown): string => {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg) {
    return toErrorMessage((msg as { message?: unknown }).message);
  }
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
};

export default function MiPerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
  });

  useEffect(() => {
    const cargarPerfil = async () => {
      try {
        setLoading(true);
        const res = await api.get<Perfil>('/postulantes/mi-perfil');
        const perfil = res.data;

        // Llenar formulario
        setValue('nombre', perfil.nombre);
        setValue('apellidos', perfil.apellidos);
        setValue('email', perfil.email);
        setValue('telefono', perfil.telefono ?? '');
        if (perfil.fechaNacimiento) {
          setValue('fechaNacimiento', perfil.fechaNacimiento.split('T')[0]);
        }
        setValue('ciudad', perfil.ciudad ?? '');
        setValue('pais', perfil.pais ?? '');
        setValue('linkedinUrl', perfil.linkedinUrl ?? '');
        setValue('vacante', perfil.vacante ?? '');
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: unknown } } };
        console.error(err);
        setServerError(
          toErrorMessage(axiosErr.response?.data?.message ?? 'Error al cargar el perfil'),
        );
      } finally {
        setLoading(false);
      }
    };

    cargarPerfil();
  }, [setValue]);

  const onSubmit = async (data: PerfilForm) => {
    try {
      setSubmitting(true);
      setServerError('');

      const payload = {
        telefono: data.telefono || undefined,
        fechaNacimiento: data.fechaNacimiento || undefined,
        ciudad: data.ciudad || undefined,
        pais: data.pais || undefined,
        linkedinUrl: data.linkedinUrl || undefined,
        vacante: data.vacante,
      };

      await api.patch('/postulantes/mi-perfil', payload);

      await Swal.fire({
        icon: 'success',
        title: '¡Perfil actualizado!',
        text: 'Tus datos han sido guardados exitosamente.',
        confirmButtonColor: '#0d6efd',
      });

      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg =
        axiosErr.response?.data?.message ??
        'Error al actualizar el perfil. Intenta de nuevo.';
      setServerError(toErrorMessage(msg));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container fluid className="nautical-panel nautical-panel-postulante d-flex align-items-center justify-content-center min-vh-100">
        <SpinnerTimon size={48} />
      </Container>
    );
  }

  return (
    <div className="min-vh-100 nautical-panel nautical-panel-postulante py-4">
      <Container>
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col lg={8}>
            <Card className="card-enmv card-enmv-top-azul card-riveted">
              <Card.Body className="p-4">
                <h1 className="section-title mb-1">
                  <IconAncla size={20} className="nautical-icon" />
                  Editar Perfil
                </h1>
                <p className="text-muted small mb-4">
                  Completa tus datos personales para continuar con tu postulación.
                </p>

                {serverError && (
                  <Alert variant="danger" className="mb-4">
                    {serverError}
                  </Alert>
                )}

                <Form onSubmit={handleSubmit(onSubmit)} noValidate>
                  {/* Sección: Datos Personales (Read-only) */}
                  <h6 className="fw-bold text-uppercase text-muted mb-3 mt-4">
                    Datos Personales (No editables)
                  </h6>

                  <Row>
                    <Col sm={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Nombre</Form.Label>
                        <Form.Control {...register('nombre')} disabled />
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Apellidos</Form.Label>
                        <Form.Control {...register('apellidos')} disabled />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-4">
                    <Form.Label>Correo Electrónico</Form.Label>
                    <Form.Control {...register('email')} disabled />
                  </Form.Group>

                  {/* Sección: Datos Adicionales */}
                  <div className="horizonte-divider" />
                  <h6 className="fw-bold text-uppercase text-muted mb-3 mt-4">
                    Información Adicional
                  </h6>

                  <Form.Group className="mb-3">
                    <Form.Label>Teléfono</Form.Label>
                    <Form.Control
                      type="tel"
                      placeholder="+34 612 345 678"
                      {...register('telefono')}
                      isInvalid={!!errors.telefono}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.telefono?.message}
                    </Form.Control.Feedback>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Fecha de Nacimiento</Form.Label>
                    <Form.Control
                      type="date"
                      {...register('fechaNacimiento')}
                      isInvalid={!!errors.fechaNacimiento}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.fechaNacimiento?.message}
                    </Form.Control.Feedback>
                  </Form.Group>

                  <Row>
                    <Col sm={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Ciudad</Form.Label>
                        <Form.Control
                          placeholder="Madrid"
                          {...register('ciudad')}
                          isInvalid={!!errors.ciudad}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.ciudad?.message}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col sm={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>País</Form.Label>
                        <Form.Control
                          placeholder="España"
                          {...register('pais')}
                          isInvalid={!!errors.pais}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.pais?.message}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label>URL de LinkedIn (Opcional)</Form.Label>
                    <Form.Control
                      type="url"
                      placeholder="https://linkedin.com/in/nombre-apellido"
                      {...register('linkedinUrl')}
                      isInvalid={!!errors.linkedinUrl}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.linkedinUrl?.message}
                    </Form.Control.Feedback>
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label>
                      Vacante a la que vas a postularte{' '}
                      <span style={{ color: 'var(--enmv-dorado)', fontWeight: 600 }}>*</span>
                    </Form.Label>
                    <Form.Control
                      placeholder="Ej. Oficial de Puente, Maquinista, Práctico de Puerto…"
                      {...register('vacante')}
                      isInvalid={!!errors.vacante}
                    />
                    <Form.Text className="text-muted">
                      Este campo es obligatorio para poder finalizar tu postulación.
                    </Form.Text>
                    <Form.Control.Feedback type="invalid">
                      {errors.vacante?.message}
                    </Form.Control.Feedback>
                  </Form.Group>

                  {/* Botones */}
                  <div className="d-flex gap-2 mt-4">
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <SpinnerTimon size={14} className="me-2" />
                          Guardando...
                        </>
                      ) : (
                        'Guardar Cambios'
                      )}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => router.push('/dashboard')}
                      disabled={submitting}
                    >
                      Cancelar
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
