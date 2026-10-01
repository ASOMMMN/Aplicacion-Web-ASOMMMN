'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarSesion, refrescarSesion, tokenActual } from '@/lib/auth/refrescarSesion';
import { avisarFalloSesion } from '@/lib/auth/avisarFalloSesion';
import NavbarENMV from '@/components/layout/NavbarENMV';
import type { NavItem } from '@/components/layout/NavbarENMV';
import FooterENMV from '@/components/layout/FooterENMV';

type RolConNube = 'evaluador' | 'administrador';

const ROLE_CONFIG: Record<
  RolConNube,
  { rolLabel: string; brandHref: string; navItems: NavItem[] }
> = {
  evaluador: {
    rolLabel: 'Evaluador',
    brandHref: '/candidatos',
    navItems: [
      { href: '/candidatos', label: 'Candidatos' },
      { href: '/mi-nube', label: 'Mi nube' },
    ],
  },
  administrador: {
    rolLabel: 'Administrador',
    brandHref: '/usuarios',
    navItems: [
      { href: '/usuarios', label: 'Usuarios' },
      { href: '/evaluaciones', label: 'Evaluaciones' },
      { href: '/mi-nube', label: 'Mi nube' },
      { href: '/reportes', label: 'Reportes' },
      { href: '/auditoria', label: 'Auditoría' },
      { href: '/analisis-documentos', label: 'Análisis de documentos' },
    ],
  },
};

function getCookieRole(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/user_role=([^;]+)/);
  return match?.[1] ?? '';
}

function esRolConNube(rol: string): rol is RolConNube {
  return rol === 'evaluador' || rol === 'administrador';
}

export default function MiNubeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [rol, setRol] = useState<RolConNube | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rolActual = getCookieRole();
      if (!esRolConNube(rolActual)) {
        router.push('/dashboard');
        return;
      }
      setRol(rolActual);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  // Tras recargar no hay token en memoria: se renueva con la cookie (la
  // misma petición que usa el interceptor). Si expiró, refrescarSesion ya
  // limpia la sesión y redirige a /login.
  useEffect(() => {
    if (tokenActual()) return;
    refrescarSesion()
      .then(({ rol: rolBd }) => {
        setRol(esRolConNube(rolBd) ? rolBd : null);
        if (!esRolConNube(rolBd)) router.push('/dashboard');
      })
      .catch(avisarFalloSesion);
  }, [router]);

  if (!rol) return null;

  const { rolLabel, brandHref, navItems } = ROLE_CONFIG[rol];

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavbarENMV
        brandHref={brandHref}
        rolLabel={rolLabel}
        navItems={navItems}
        onLogout={cerrarSesion}
      />
      <main className="flex-grow-1">{children}</main>
      <FooterENMV />
    </div>
  );
}
