'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarSesion, refrescarSesion, tokenActual } from '@/lib/auth/refrescarSesion';
import { avisarFalloSesion } from '@/lib/auth/avisarFalloSesion';
import AppNavbar from '@/components/layout/AppNavbar';
import AppFooter from '@/components/layout/AppFooter';
import ChatbotWidget from '@/components/chatbot/ChatbotWidget';
import { ROLE_HOME } from '@/lib/auth/roleHome';
import ModalConsentimientoPrivacidad from '@/components/legal/ModalConsentimientoPrivacidad';
import { useConsentimientoPendiente } from '@/lib/privacidad/consentimientoPendiente';

const NAV_ITEMS = [
  { href: '/dashboard',           label: 'Dashboard' },
  { href: '/mi-perfil',           label: 'Mi Perfil' },
  { href: '/mi-cv',               label: 'Mi CV' },
  { href: '/mis-cursos',          label: 'Mis cursos' },
  { href: '/mis-docs-personales', label: 'Docs personales' },
  { href: '/estado',              label: 'Estado' },
];

export default function PostulanteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // P-01: sin aceptar el aviso vigente no se muestra la app (la API también
  // la bloquea); solo el modal de aceptación.
  const consentimientoPendiente = useConsentimientoPendiente();

  // Tras recargar no hay token en memoria: se renueva con la cookie (la
  // misma petición que usa el interceptor). Si expiró, refrescarSesion ya
  // limpia la sesión y redirige a /login.
  useEffect(() => {
    if (tokenActual()) return;
    refrescarSesion()
      .then(({ rol }) => {
        if (rol !== 'postulante') router.replace(ROLE_HOME[rol] ?? '/login');
      })
      .catch(avisarFalloSesion);
  }, [router]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <AppNavbar
        brandHref="/dashboard"
        rolLabel="Postulante"
        navItems={NAV_ITEMS}
        onLogout={cerrarSesion}
      />
      <main className="flex-grow-1">{consentimientoPendiente ? null : children}</main>
      <AppFooter />
      {consentimientoPendiente ? <ModalConsentimientoPrivacidad /> : <ChatbotWidget />}
    </div>
  );
}

