/** Rutas accesibles sin sesión (las usa el proxy y la redirección al login). */
export const PUBLIC_PREFIXES = [
  '/login',
  '/cambiar-contrasena',
  '/registro',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/verificar-email',
];

export const esRutaPublica = (pathname: string) =>
  PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
