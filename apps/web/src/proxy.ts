import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/cambiar-contrasena",
  "/registro",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/verificar-email",
];

const ROLE_HOME: Record<string, string> = {
  postulante: "/dashboard",
  evaluador: "/candidatos",
  administrador: "/usuarios",
};

const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  postulante: [
    "/dashboard",
    "/estado",
    "/mi-cv",
    "/mi-perfil",
    "/mis-cursos",
    "/mis-docs-personales",
    "/mi-bitacora-embarque",
  ],
  evaluador: ["/candidatos", "/candidato", "/archivos", "/mi-nube"],
  administrador: [
    "/usuarios",
    "/evaluaciones",
    "/mi-nube",
    "/reportes",
    "/auditoria",
  ],
};

const VALID_ROLES = new Set(Object.keys(ROLE_HOME));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawRole = request.cookies.get("user_role")?.value;
  const role = rawRole && VALID_ROLES.has(rawRole) ? rawRole : undefined;

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  const withClearedRoleCookie = (response: NextResponse) => {
    if (rawRole && !role) {
      response.cookies.set("user_role", "", { path: "/", maxAge: 0 });
    }
    return response;
  };

  if (!role && !isPublic) {
    return withClearedRoleCookie(
      NextResponse.redirect(new URL("/login", request.url)),
    );
  }

  if (role && isPublic) {
    const dest = ROLE_HOME[role] ?? "/login";
    return withClearedRoleCookie(
      NextResponse.redirect(new URL(dest, request.url)),
    );
  }

  if (role && !isPublic) {
    const allowedPrefixes = ROLE_ALLOWED_PREFIXES[role] ?? [];
    const isAllowed =
      pathname === "/" ||
      allowedPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!isAllowed) {
      return withClearedRoleCookie(
        NextResponse.redirect(
          new URL(ROLE_HOME[role] ?? "/login", request.url),
        ),
      );
    }
  }

  return withClearedRoleCookie(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp4|webm)$).*)",
  ],
};
