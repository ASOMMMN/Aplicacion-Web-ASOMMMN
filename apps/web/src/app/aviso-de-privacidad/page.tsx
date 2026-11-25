import type { Metadata } from 'next';
import Image from 'next/image';
import AppFooter from '@/components/layout/AppFooter';
import AvisoPrivacidadContenido from '@/components/legal/AvisoPrivacidadContenido';
import BotonEncabezadoAviso from '@/components/legal/BotonEncabezadoAviso';
import { ALT_ESCUDO, NOMBRE_CORTO, NOMBRE_LARGO } from '@/lib/branding';

// BORRADOR pendiente de revisión legal: ver el encabezado de
// components/legal/AvisoPrivacidadContenido.tsx.

export const metadata: Metadata = {
  title: `Aviso de privacidad — ${NOMBRE_CORTO}`,
  description: `Aviso de privacidad integral de la Plataforma de Evaluación Curricular de ${NOMBRE_LARGO}.`,
};

/** Página pública: se abre con o sin sesión (ver lib/auth/rutasPublicas.ts). */
export default function AvisoDePrivacidadPage() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <header className="navbar-asommmn py-2">
        <div className="container-fluid d-flex align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2 text-white">
            <Image
              src="/escudo-ASOMMMN-transparente.png"
              alt={ALT_ESCUDO}
              title={NOMBRE_LARGO}
              width={46}
              height={46}
              style={{ flexShrink: 0 }}
              priority
            />
            <div>
              <span className="d-block font-serif" style={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
                Asociación Sindical
              </span>
              <span className="d-block fw-bold font-serif" style={{ fontSize: '0.9rem', lineHeight: 1.2 }}>
                {NOMBRE_CORTO}
              </span>
            </div>
          </div>
          {/* Sin sesión: nada. Con sesión: "Volver" o "Ir a mi panel". */}
          <BotonEncabezadoAviso />
        </div>
      </header>

      <main className="flex-grow-1 py-4 py-md-5">
        <div className="container" style={{ maxWidth: 860 }}>
          <AvisoPrivacidadContenido />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
