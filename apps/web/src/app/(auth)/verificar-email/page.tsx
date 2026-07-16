'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Spinner, Alert, Button } from 'react-bootstrap';
import api from '@/lib/api/client';

function VerificarEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const init = async () => {
      const token = params.get('token');
      if (!token) {
        setStatus('error');
        setMessage('Token no encontrado en la URL.');
        return;
      }
      try {
        await api.get(`/auth/verificar-email?token=${token}`);
        setStatus('ok');
        setMessage('¡Correo verificado! Ya puedes iniciar sesión.');
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: unknown } } };
        setStatus('error');
        setMessage(String(axiosErr.response?.data?.message ?? 'Token inválido o expirado.'));
      }
    };
    init();
  }, [params]);

  return (
    <div className="auth-page">
      <div className="auth-card text-center">
        <div className="mb-3">
          <i
            className="bi bi-envelope-check mb-2 d-block"
            style={{ fontSize: '2rem', color: 'var(--enmv-azul)' }}
          />
          <p className="nombre-escuela mb-0">Verificación de correo</p>
          <div className="auth-divider" />
        </div>

        {status === 'loading' && (
          <>
            <Spinner animation="border" className="mb-3" />
            <p className="text-muted">Verificando tu cuenta…</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <Alert variant="success">{message}</Alert>
            <Button className="btn-primary w-100" onClick={() => router.push('/login')}>
              Ir al login
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Alert variant="danger">{message}</Alert>
            <Button
              variant="outline-secondary"
              className="w-100"
              onClick={() => router.push('/login')}
            >
              Volver al login
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerificarEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="d-flex align-items-center justify-content-center min-vh-100">
          <Spinner animation="border" />
        </div>
      }
    >
      <VerificarEmailContent />
    </Suspense>
  );
}
