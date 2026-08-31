'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
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

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      !(window as Window & { __asommmn_token?: string | null }).__asommmn_token
    ) {
      api
        .post<{ accessToken: string; rol: string }>('/auth/refresh')
        .then(({ data }) => {
          (window as Window & { __asommmn_token?: string | null }).__asommmn_token = data.accessToken;
          // Re-sincroniza el cookie de rol con el rol actual en BD: si cambió
          // desde el último login, evita que se siga usando el rol viejo.
          document.cookie = `user_role=${data.rol}; path=/; SameSite=Strict`;
          setRol(esRolConNube(data.rol) ? data.rol : null);
          if (!esRolConNube(data.rol)) {
            router.push('/dashboard');
          }
        })
        .catch(() => router.push('/login'));
    }
  }, [router]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      (window as Window & { __asommmn_token?: string | null }).__asommmn_token = null;
      document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC';
      router.push('/login');
    } catch {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cerrar la sesión.' });
    }
  };

  if (!rol) return null;

  const { rolLabel, brandHref, navItems } = ROLE_CONFIG[rol];

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavbarENMV
        brandHref={brandHref}
        rolLabel={rolLabel}
        navItems={navItems}
        onLogout={handleLogout}
      />
      <main className="flex-grow-1">{children}</main>
      <FooterENMV />
    </div>
  );
}
