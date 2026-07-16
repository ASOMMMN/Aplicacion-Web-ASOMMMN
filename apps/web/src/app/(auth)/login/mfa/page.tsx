'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { session } from '@/lib/auth/session';

const ROLE_HOME: Record<string, string> = {
  postulante: '/dashboard',
  evaluador: '/candidatos',
  administrador: '/usuarios',
};

export default function MfaLoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [usarCodigoRecuperacion, setUsarCodigoRecuperacion] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [tempSessionToken, setTempSessionToken] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [manualKey, setManualKey] = useState('');

  const iniciarSetup = useCallback(async (token: string) => {
    setLoadingSetup(true);
    setError('');
    try {
      const { data } = await api.post<{
        qrCodeUrl: string;
        manualEntryKey: string;
      }>('/auth/mfa/setup/iniciar', { tempSessionToken: token });
      setQrCodeUrl(data.qrCodeUrl);
      setManualKey(data.manualEntryKey);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(
        String(
          axiosErr.response?.data?.message ??
            'No se pudo iniciar la configuración MFA. Vuelve a iniciar sesión.',
        ),
      );
    } finally {
      setLoadingSetup(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const token = sessionStorage.getItem('mfa_temp_session') ?? '';
      const needsSetup = sessionStorage.getItem('mfa_setup_required') === '1';

      if (!token) {
        router.replace('/login');
        return;
      }

      setTempSessionToken(token);
      setSetupRequired(needsSetup);

      if (needsSetup) {
        await iniciarSetup(token);
      }
    };
    init();
  }, [router, iniciarSetup]);

  const completarSesion = (
    payload: { accessToken: string; user: { rol: string } },
    recoveryCodes?: string[],
  ) => {
    session.set(payload.accessToken, payload.user.rol);
    (window as Window & { __asommmn_token?: string | null }).__asommmn_token =
      payload.accessToken;

    sessionStorage.removeItem('mfa_temp_session');
    sessionStorage.removeItem('mfa_setup_required');
    sessionStorage.removeItem('mfa_user_role');

    if (recoveryCodes && recoveryCodes.length > 0) {
      void Swal.fire({
        icon: 'info',
        title: 'Guarda tus códigos de recuperación',
        html: `<div style="text-align:left"><p>Se mostrarán una sola vez:</p><pre style="white-space:pre-wrap">${recoveryCodes.join('\n')}</pre></div>`,
        confirmButtonText: 'Entendido',
      });
    }

    router.push(ROLE_HOME[payload.user.rol] ?? '/');
  };

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (setupRequired) {
        const { data } = await api.post<{
          accessToken: string;
          user: { rol: string };
          recoveryCodes: string[];
        }>('/auth/mfa/setup/activar', { tempSessionToken, codigo });
        completarSesion(data, data.recoveryCodes);
      } else {
        const { data } = await api.post<{
          accessToken: string;
          user: { rol: string };
        }>('/auth/mfa/verificar-login', {
          tempSessionToken,
          ...(usarCodigoRecuperacion
            ? { codigoRecuperacion: codigo }
            : { codigo }),
        });
        completarSesion(data);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      const msg =
        axiosErr.response?.data?.message ?? 'No se pudo completar la verificación MFA.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-3">
          <i
            className="bi bi-shield-check mb-2 d-block"
            style={{ fontSize: '2rem', color: 'var(--enmv-azul)' }}
          />
          <p className="nombre-escuela mb-0">Verificación MFA</p>
          <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.8rem' }}>
            {setupRequired
              ? 'Configura MFA para continuar con tu acceso.'
              : 'Ingresa el código de tu app autenticadora.'}
          </p>
          <div className="auth-divider" />
        </div>

        {error && (
          <Alert variant="danger" className="py-2 small">
            {error}
          </Alert>
        )}

        {setupRequired && loadingSetup && (
          <div className="text-center mb-3">
            <Spinner size="sm" className="me-2" />
            Preparando configuración MFA...
          </div>
        )}

        {setupRequired && qrCodeUrl && (
          <div className="text-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeUrl}
              alt="QR MFA"
              style={{ maxWidth: 220, width: '100%' }}
            />
            <p className="small text-muted mt-2 mb-1">Clave manual</p>
            <code className="small">{manualKey}</code>
          </div>
        )}

        <Form onSubmit={onSubmit}>
          {!setupRequired && (
            <div className="mb-2 d-flex justify-content-end">
              <Button
                variant="link"
                className="p-0 small"
                style={{ color: 'var(--enmv-azul)' }}
                onClick={() => {
                  setCodigo('');
                  setUsarCodigoRecuperacion((prev) => !prev);
                }}
              >
                {usarCodigoRecuperacion
                  ? 'Usar código de app'
                  : 'Usar código de recuperación'}
              </Button>
            </div>
          )}

          <Form.Group className="mb-3">
            <Form.Label>
              {usarCodigoRecuperacion ? 'Código de recuperación' : 'Código MFA'}
            </Form.Label>
            <Form.Control
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\s+/g, ''))}
              minLength={6}
              maxLength={usarCodigoRecuperacion ? 24 : 8}
              required
              placeholder={usarCodigoRecuperacion ? 'ABCD1234' : '123456'}
            />
          </Form.Group>

          <Button
            type="submit"
            className="w-100 btn-primary"
            disabled={loading || loadingSetup || !tempSessionToken}
            style={{ padding: '0.65rem', fontWeight: 600 }}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Verificando...
              </>
            ) : setupRequired ? (
              'Activar MFA y continuar'
            ) : (
              'Verificar y continuar'
            )}
          </Button>
        </Form>
      </div>
    </div>
  );
}
