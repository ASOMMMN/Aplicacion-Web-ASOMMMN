"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cerrarSesion, refrescarSesion, tokenActual } from "@/lib/auth/refrescarSesion";
import { avisarFalloSesion } from "@/lib/auth/avisarFalloSesion";
import NavbarENMV from "@/components/layout/NavbarENMV";
import FooterENMV from "@/components/layout/FooterENMV";
import { ROLE_HOME } from "@/lib/auth/roleHome";

const NAV_ITEMS = [
  { href: "/usuarios", label: "Usuarios" },
  { href: "/evaluaciones", label: "Evaluaciones" },
  { href: "/mi-nube", label: "Mi nube" },
  { href: "/reportes", label: "Reportes" },
  { href: "/auditoria", label: "Auditoría" },
  { href: "/analisis-documentos", label: "Análisis de documentos" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Tras recargar no hay token en memoria: se renueva con la cookie (la
  // misma petición que usa el interceptor). Si expiró, refrescarSesion ya
  // limpia la sesión y redirige a /login.
  useEffect(() => {
    if (tokenActual()) return;
    refrescarSesion()
      .then(({ rol }) => {
        if (rol !== "administrador") router.replace(ROLE_HOME[rol] ?? "/login");
      })
      .catch(avisarFalloSesion);
  }, [router]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavbarENMV
        brandHref="/usuarios"
        rolLabel="Administrador"
        navItems={NAV_ITEMS}
        onLogout={cerrarSesion}
      />
      <main className="flex-grow-1">{children}</main>
      <FooterENMV />
    </div>
  );
}
