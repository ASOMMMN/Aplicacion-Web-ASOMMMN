'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarSesion, refrescarSesion, tokenActual } from '@/lib/auth/refrescarSesion';
import { avisarFalloSesion } from '@/lib/auth/avisarFalloSesion';
import AppNavbar from '@/components/layout/AppNavbar';
import AppFooter from '@/components/layout/AppFooter';
import { NotificacionesBell } from '@/components/layout/NotificacionesBell';
import { ROLE_HOME } from '@/lib/auth/roleHome';

const NAV_ITEMS = [
  { href: '/candidatos', label: 'Candidatos' },
  { href: '/mi-nube',    label: 'Mi nube' },
];

// El backend ya permite administrador en GET /evaluaciones/candidatos (ve
// además quién eliminó a cada usuario); solo faltaba no bloquearlo aquí.
const ROLES_PERMITIDOS = ['evaluador', 'administrador'];

export default function EvaluadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [rolLabel, setRolLabel] = useState('Evaluador');

  // Tras recargar no hay token en memoria: se renueva con la cookie (la
  // misma petición que usa el interceptor). Si expiró, refrescarSesion ya
  // limpia la sesión y redirige a /login.
  useEffect(() => {
    if (tokenActual()) return;
    refrescarSesion()
      .then(({ rol }) => {
        if (!ROLES_PERMITIDOS.includes(rol)) {
          router.replace(ROLE_HOME[rol] ?? '/login');
          return;
        }
        if (rol === 'administrador') setRolLabel('Administrador');
      })
      .catch(avisarFalloSesion);
  }, [router]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <AppNavbar
        brandHref="/candidatos"
        rolLabel={rolLabel}
        navItems={NAV_ITEMS}
        onLogout={cerrarSesion}
        rightContent={<NotificacionesBell />}
      />
      <main className="flex-grow-1">{children}</main>
      <AppFooter />
    </div>
  );
}

