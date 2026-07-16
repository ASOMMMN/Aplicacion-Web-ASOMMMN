'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';

type UserRole = 'postulante' | 'evaluador' | 'administrador';
type AccountStatus = 'pendiente_verificacion' | 'activa' | 'bloqueada';
type EditableRole = 'evaluador' | 'administrador';

interface UsuarioItem {
  _id: string;
  email: string;
  nombre: string;
  apellidos: string;
  rol: UserRole;
  estadoCuenta: AccountStatus;
  emailVerificado?: boolean;
  creadoEn?: string;
  ultimoAcceso?: string | null;
}

interface UsuariosResponse {
  data: UsuarioItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface RestablecerContrasenaResponse {
  usuarioId: string;
  email: string;
  debeCambiarContrasena: boolean;
  passwordTemporal: string;
}

const roleLabel: Record<UserRole, string> = {
  postulante: 'Postulante',
  evaluador: 'Evaluador',
  administrador: 'Administrador',
};

const roleClass: Record<UserRole, string> = {
  postulante: 'badge-estado-proceso',
  evaluador: '',
  administrador: '',
};

const roleStyle: Record<UserRole, React.CSSProperties> = {
  postulante: {},
  evaluador: { background: 'var(--enmv-azul)', color: '#fff' },
  administrador: { background: '#2c3e50', color: '#fff' },
};

const statusLabel: Record<AccountStatus, string> = {
  pendiente_verificacion: 'Pendiente',
  activa: 'Activa',
  bloqueada: 'Bloqueada',
};

const statusClass: Record<AccountStatus, string> = {
  pendiente_verificacion: 'badge-estado-proceso',
  activa: 'badge-estado-aprobado',
  bloqueada: 'badge-estado-rechazado',
};

const initialCreateForm = {
  email: '',
  nombre: '',
  apellidos: '',
  password: '',
  rol: 'evaluador' as EditableRole,
};

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const toErrorMessage = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object' && 'message' in value) {
    return toErrorMessage((value as { message?: unknown }).message);
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? 'Error inesperado');
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
};

export default function UsuariosPage() {
  const [items, setItems] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [createForm, setCreateForm] = useState(initialCreateForm);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<UsuariosResponse>('/usuarios', {
        params: { page: 1, limit: 100 },
      });
      setItems(res.data?.data ?? []);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => { await loadUsers(); };
    init();
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesText =
        !query ||
        item.email.toLowerCase().includes(query) ||
        `${item.nombre} ${item.apellidos}`.toLowerCase().includes(query);
      const matchesRole = roleFilter === 'all' || item.rol === roleFilter;
      const matchesStatus = statusFilter === 'all' || item.estadoCuenta === statusFilter;
      return matchesText && matchesRole && matchesStatus;
    });
  }, [items, roleFilter, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      evaluadores: items.filter((item) => item.rol === 'evaluador').length,
      administradores: items.filter((item) => item.rol === 'administrador').length,
      activos: items.filter((item) => item.estadoCuenta === 'activa').length,
    };
  }, [items]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      await api.post('/usuarios', createForm);
      setCreateForm(initialCreateForm);
      await loadUsers();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, estado: AccountStatus) => {
    try {
      setActionId(id);
      setError('');
      await api.patch(`/usuarios/${id}/estado`, { estado });
      await loadUsers();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setActionId('');
    }
  };

  const restablecerContrasena = async (item: UsuarioItem) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: '¿Restablecer contraseña?',
      text: `Se generará una contraseña temporal para ${item.email}.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, restablecer',
      cancelButtonText: 'Cancelar',
    });

    if (!confirm.isConfirmed) return;

    try {
      setActionId(item._id);
      const res = await api.post<RestablecerContrasenaResponse>(
        `/usuarios/${item._id}/restablecer-contrasena`,
      );

      const tempPassword = res.data.passwordTemporal;
      const modal = await Swal.fire({
        icon: 'success',
        title: 'Contraseña temporal generada',
        html: `<p class="mb-2">Compártela al usuario de forma segura:</p><code>${tempPassword}</code><p class="mt-2 mb-0 small text-muted">El usuario deberá cambiarla al iniciar sesión.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Copiar',
        cancelButtonText: 'Cerrar',
      });

      if (modal.isConfirmed && navigator?.clipboard) {
        await navigator.clipboard.writeText(tempPassword);
        await Swal.fire({
          icon: 'info',
          title: 'Copiada',
          text: 'La contraseña temporal se copió al portapapeles.',
        });
      }

      await loadUsers();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } }; message?: string };
      setError(toErrorMessage(axiosErr.response?.data?.message ?? axiosErr.message));
    } finally {
      setActionId('');
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center min-vh-100">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <div className="py-4" style={{ background: 'var(--enmv-fondo)', minHeight: '100vh' }}>
      <Container fluid>
        <Row className="mb-4 align-items-end g-3">
          <Col lg={7}>
            <div className="d-flex flex-column gap-2">
              <span className="badge badge-pill-enmv badge-estado-proceso align-self-start">
                Administración
              </span>
              <h1 className="section-title" style={{ fontSize: '1.5rem' }}>Usuarios del sistema</h1>
              <p className="text-muted mb-0">
                Gestiona postulantes, evaluadores y administradores desde esta vista.
              </p>
            </div>
          </Col>
          <Col lg={5}>
            <Form.Control
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo"
            />
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="shadow-sm">
            {error}
          </Alert>
        )}

        <Row className="g-3 mb-4">
          <Col md={3}>
            <Card className="card-enmv card-enmv-top-azul h-100">
              <Card.Body>
                <div className="text-muted small">Total</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-azul)' }}>{stats.total}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="card-enmv card-enmv-top-dorado h-100">
              <Card.Body>
                <div className="text-muted small">Evaluadores</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-dorado)' }}>{stats.evaluadores}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="card-enmv card-enmv-top-azul h-100">
              <Card.Body>
                <div className="text-muted small">Administradores</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-azul)' }}>{stats.administradores}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="card-enmv card-enmv-top-verde h-100">
              <Card.Body>
                <div className="text-muted small">Activos</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--enmv-verde)' }}>{stats.activos}</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row className="g-4">
          <Col xl={4}>
            <Card className="card-enmv card-enmv-top-dorado mb-4">
              <Card.Body>
                <Card.Title className="section-title mb-1">Crear usuario</Card.Title>
                <Card.Text className="text-muted small mb-3">
                  Solo puedes crear evaluadores o administradores desde aquí.
                </Card.Text>

                <Form onSubmit={handleCreate} className="d-grid gap-3">
                  <Form.Group>
                    <Form.Label>Correo</Form.Label>
                    <Form.Control
                      type="email"
                      value={createForm.email}
                      onChange={(e) =>
                        setCreateForm((current) => ({ ...current, email: e.target.value }))
                      }
                      required
                    />
                  </Form.Group>

                  <Row className="g-3">
                    <Col md={6} xl={12}>
                      <Form.Group>
                        <Form.Label>Nombre</Form.Label>
                        <Form.Control
                          value={createForm.nombre}
                          onChange={(e) =>
                            setCreateForm((current) => ({
                              ...current,
                              nombre: e.target.value,
                            }))
                          }
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} xl={12}>
                      <Form.Group>
                        <Form.Label>Apellidos</Form.Label>
                        <Form.Control
                          value={createForm.apellidos}
                          onChange={(e) =>
                            setCreateForm((current) => ({
                              ...current,
                              apellidos: e.target.value,
                            }))
                          }
                          required
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group>
                    <Form.Label>Contraseña</Form.Label>
                    <Form.Control
                      type="text"
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm((current) => ({
                          ...current,
                          password: e.target.value,
                        }))
                      }
                      required
                      minLength={10}
                    />
                    <Form.Text className="text-muted">
                      En este entorno se guarda directamente en <code>passwordHash</code>.
                    </Form.Text>
                  </Form.Group>

                  <Form.Group>
                    <Form.Label>Rol</Form.Label>
                    <Form.Select
                      value={createForm.rol}
                      onChange={(e) =>
                        setCreateForm((current) => ({
                          ...current,
                          rol: e.target.value as EditableRole,
                        }))
                      }
                    >
                      <option value="evaluador">Evaluador</option>
                      <option value="administrador">Administrador</option>
                    </Form.Select>
                  </Form.Group>

                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Guardando...
                      </>
                    ) : (
                      'Crear usuario'
                    )}
                  </Button>
                </Form>
              </Card.Body>
            </Card>

            <Card className="card-enmv card-enmv-top-azul">
              <Card.Body>
                <Card.Title className="section-title mb-3">Filtros</Card.Title>
                <Row className="g-3">
                  <Col md={6} xl={12}>
                    <Form.Label className="small text-muted">Rol</Form.Label>
                    <Form.Select
                      value={roleFilter}
                      onChange={(e) =>
                        setRoleFilter(e.target.value as 'all' | UserRole)
                      }
                    >
                      <option value="all">Todos</option>
                      <option value="postulante">Postulantes</option>
                      <option value="evaluador">Evaluadores</option>
                      <option value="administrador">Administradores</option>
                    </Form.Select>
                  </Col>
                  <Col md={6} xl={12}>
                    <Form.Label className="small text-muted">Estado</Form.Label>
                    <Form.Select
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as 'all' | AccountStatus)
                      }
                    >
                      <option value="all">Todos</option>
                      <option value="pendiente_verificacion">Pendientes</option>
                      <option value="activa">Activos</option>
                      <option value="bloqueada">Bloqueados</option>
                    </Form.Select>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>

          <Col xl={8}>
            <Card className="card-enmv card-enmv-top-azul">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                  <div>
                    <Card.Title className="section-title mb-1">Listado de usuarios</Card.Title>
                    <Card.Text className="text-muted small mb-0">
                      {filteredItems.length} resultado(s) visibles de {items.length} usuario(s).
                    </Card.Text>
                  </div>
                  <Button variant="outline-secondary" size="sm" onClick={() => void loadUsers()}>
                    Refrescar
                  </Button>
                </div>

                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Verificado</th>
                        <th>Creado</th>
                        <th>Último acceso</th>
                        <th className="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-4">
                            No hay usuarios con esos filtros.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => (
                          <tr key={item._id}>
                            <td>
                              <div className="fw-semibold">
                                {item.nombre} {item.apellidos}
                              </div>
                              <div className="small text-muted">{item.email}</div>
                            </td>
                            <td>
                              <span className={`badge badge-pill-enmv ${roleClass[item.rol]}`} style={roleStyle[item.rol]}>{roleLabel[item.rol]}</span>
                            </td>
                            <td>
                              <span className={`badge badge-pill-enmv ${statusClass[item.estadoCuenta]}`}>
                                {statusLabel[item.estadoCuenta]}
                              </span>
                            </td>
                            <td>
                              {item.emailVerificado ? (
                                <span className="text-success small">Sí</span>
                              ) : (
                                <span className="text-muted small">No</span>
                              )}
                            </td>
                            <td className="small text-muted">{formatDate(item.creadoEn)}</td>
                            <td className="small text-muted">{formatDate(item.ultimoAcceso)}</td>
                            <td className="text-end">
                              <div className="d-flex justify-content-end gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline-primary"
                                  disabled={actionId === item._id}
                                  onClick={() => void restablecerContrasena(item)}
                                >
                                  Restablecer contraseña
                                </Button>
                                {item.estadoCuenta !== 'activa' ? (
                                  <Button
                                    size="sm"
                                    variant="outline-success"
                                    disabled={actionId === item._id}
                                    onClick={() => void updateStatus(item._id, 'activa')}
                                  >
                                    Activar
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    disabled={actionId === item._id}
                                    onClick={() => void updateStatus(item._id, 'bloqueada')}
                                  >
                                    Bloquear
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}