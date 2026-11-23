'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import {
  MENSAJES_TURNSTILE,
  TURNSTILE_SITE_KEY,
  URL_SCRIPT_TURNSTILE,
  turnstileActivo,
} from '@/lib/auth/turnstile';

/**
 * Widget de Cloudflare Turnstile (anti-bots) para login, registro y
 * recuperar contraseña. La API valida el token (body.turnstileToken).
 *
 * - Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY no se pinta nada (desarrollo local):
 *   el formulario funciona sin captcha.
 * - Si el widget falla o el token expira, se reinicia solo y se muestra un
 *   mensaje; mientras no haya token el formulario no se puede enviar.
 * - El token es de un solo uso: el formulario llama a reset() tras cada
 *   intento, salga bien o mal.
 */

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let cargaScript: Promise<TurnstileApi> | null = null;

function cargarTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  cargaScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = URL_SCRIPT_TURNSTILE;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no cargó'));
    script.onerror = () => {
      cargaScript = null;
      script.remove();
      reject(new Error('No se pudo cargar Turnstile'));
    };
    document.head.appendChild(script);
  });
  return cargaScript;
}

export interface TurnstileHandle {
  /** Descarta el token actual y pide uno nuevo (los tokens son de un solo uso). */
  reset: () => void;
}

interface Props {
  /** Acción que se reporta a Cloudflare (login, registro, recuperar). */
  action: string;
  /** Token nuevo, o '' cuando ya no hay uno válido. */
  onToken: (token: string) => void;
}

const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile({ action, onToken }, ref) {
  const contenedor = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current('');
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (!turnstileActivo || !contenedor.current) return;
    let cancelado = false;

    /** Sin token válido: se avisa y se pide otro. */
    const reiniciar = (mensaje: string) => {
      onTokenRef.current('');
      setAviso(mensaje);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    };

    cargarTurnstile()
      .then((ts) => {
        if (cancelado || !contenedor.current) return;
        widgetId.current = ts.render(contenedor.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language: 'es',
          // El reintento lo controlamos nosotros (mensaje + reset).
          retry: 'never',
          'refresh-expired': 'manual',
          callback: (token: string) => {
            setAviso('');
            onTokenRef.current(token);
          },
          'expired-callback': () => reiniciar(MENSAJES_TURNSTILE.expirado),
          'error-callback': () => {
            reiniciar(MENSAJES_TURNSTILE.error);
            // true: el error ya se atendió (Cloudflare no lo relanza).
            return true;
          },
          'timeout-callback': () => reiniciar(MENSAJES_TURNSTILE.expirado),
        });
      })
      .catch(() => {
        if (cancelado) return;
        onTokenRef.current('');
        setAviso(MENSAJES_TURNSTILE.sinCargar);
      });

    return () => {
      cancelado = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  if (!turnstileActivo) return null;
  return (
    <div className="mb-3">
      <div ref={contenedor} className="d-flex justify-content-center" />
      {aviso && (
        <Alert variant="warning" className="py-2 small mt-2 mb-0" role="status">
          {aviso}
        </Alert>
      )}
    </div>
  );
});

export default Turnstile;
