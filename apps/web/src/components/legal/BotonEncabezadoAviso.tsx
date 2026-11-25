'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import {
  type BotonAviso,
  decidirBotonAviso,
  leerContextoNavegacion,
} from '@/lib/privacidad/botonEncabezadoAviso';

/** Vista sin estado: null o ninguno → no se pinta nada. */
export function BotonEncabezadoAvisoVista({
  decision,
  onVolver,
}: {
  decision: BotonAviso | null;
  onVolver: () => void;
}) {
  if (!decision || decision.tipo === 'ninguno') return null;
  if (decision.tipo === 'volver') {
    return (
      <button type="button" className="btn btn-sm btn-outline-light" onClick={onVolver}>
        <i className="bi bi-arrow-left me-1" aria-hidden="true" />
        Volver
      </button>
    );
  }
  return (
    <Link href={decision.href} className="btn btn-sm btn-outline-light">
      <i className="bi bi-grid me-1" aria-hidden="true" />
      Ir a mi panel
    </Link>
  );
}

// El contexto no cambia mientras la página está abierta: no hay a qué suscribirse.
const sinSuscripcion = () => () => {};
// Se compara por valor (texto): mismo contexto → mismo snapshot.
const leerDecision = () => JSON.stringify(decidirBotonAviso(leerContextoNavegacion()));
// En el servidor no se sabe si hay sesión: no se pinta nada (sin parpadeo).
const decisionServidor = () => null;

/**
 * Botón del encabezado de /aviso-de-privacidad (ver decidirBotonAviso).
 * No muestra nada hasta conocer el contexto en el navegador.
 */
export default function BotonEncabezadoAviso() {
  const router = useRouter();
  const clave = useSyncExternalStore(sinSuscripcion, leerDecision, decisionServidor);
  const decision = clave ? (JSON.parse(clave) as BotonAviso) : null;
  return <BotonEncabezadoAvisoVista decision={decision} onVolver={() => router.back()} />;
}
