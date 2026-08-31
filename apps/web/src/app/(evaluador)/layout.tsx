'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import NavbarENMV from '@/components/layout/NavbarENMV';
import FooterENMV from '@/components/layout/FooterENMV';
import { NotificacionesBell } from '@/components/layout/NotificacionesBell';
import { ROLE_HOME } from '@/lib/auth/roleHome';

const NAV_ITEMS = [
  { href: '/candidatos', label: 'Candidatos' },
  { href: '/mi-nube',    label: 'Mi nube' },
];

export default function EvaluadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as Window & { __asommmn_token?: string | null }).__asommmn_token) {
      api
        .post<{ accessToken: string; rol: string }>('/auth/refresh')
        .then(({ data }) => {
          (window as Window & { __asommmn_token?: string | null }).__asommmn_token = data.accessToken;
          // Re-sincroniza el cookie de rol con el rol actual en BD: si cambió
          // desde el último login, evita que el proxy siga enrutando con el rol viejo.
          document.cookie = `user_role=${data.rol}; path=/; SameSite=Strict`;
          if (data.rol !== 'evaluador') {
            router.replace(ROLE_HOME[data.rol] ?? '/login');
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

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavbarENMV
        brandHref="/candidatos"
        rolLabel="Evaluador"
        navItems={NAV_ITEMS}
        onLogout={handleLogout}
        rightContent={<NotificacionesBell />}
      />
      <main className="flex-grow-1">{children}</main>
      <FooterENMV />
    </div>
  );
}

