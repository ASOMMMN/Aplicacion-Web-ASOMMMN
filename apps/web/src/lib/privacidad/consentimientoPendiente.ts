'use client';

/**
 * ¿Falta que el postulante acepte el aviso de privacidad vigente?
 *
 * Lo ponen en true: la respuesta de /auth/login y /auth/refresh
 * (requiresPrivacyConsent) y el cliente HTTP ante un 403
 * PRIVACY_CONSENT_REQUIRED. El layout del postulante muestra el modal
 * bloqueante mientras sea true. Se guarda también en sessionStorage para que
 * una recarga no muestre la app un instante antes de que llegue /auth/refresh.
 */
import { useSyncExternalStore } from 'react';

const CLAVE = 'privacidad_pendiente';
const oyentes = new Set<() => void>();
let pendiente: boolean | null = null;

function leer(): boolean {
  if (pendiente !== null) return pendiente;
  if (typeof window === 'undefined') return false;
  try {
    pendiente = window.sessionStorage.getItem(CLAVE) === '1';
  } catch {
    pendiente = false;
  }
  return pendiente;
}

export function marcarConsentimientoPendiente(valor: boolean): void {
  pendiente = valor;
  try {
    if (valor) window.sessionStorage.setItem(CLAVE, '1');
    else window.sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin sessionStorage (modo privado estricto): basta la memoria.
  }
  oyentes.forEach((o) => o());
}

export const consentimientoPendiente = (): boolean => leer();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useConsentimientoPendiente(): boolean {
  return useSyncExternalStore(suscribir, leer, () => false);
}
