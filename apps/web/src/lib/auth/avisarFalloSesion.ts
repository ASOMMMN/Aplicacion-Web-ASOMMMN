'use client';

import Swal from 'sweetalert2';
import { ErrorSesion } from './refrescarSesion';

/**
 * Aviso para los layouts cuando no se pudo renovar la sesión. Si expiró ya
 * se está redirigiendo a /login: no hay nada que mostrar.
 */
export function avisarFalloSesion(err: unknown) {
  if (err instanceof ErrorSesion && err.motivo === 'expirada') return;
  const texto = err instanceof Error ? err.message : 'No se pudo renovar la sesión, intenta de nuevo';
  void Swal.fire({
    icon: 'warning',
    text: texto,
    toast: true,
    position: 'top-end',
    timer: 5000,
    showConfirmButton: false,
  });
}
