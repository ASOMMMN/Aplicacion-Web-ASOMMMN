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

/**
 * Rutas que se abren con o sin sesión y con cualquier rol (el proxy no
 * redirige): el aviso de privacidad se enlaza desde el registro, el login,
 * el pie de página y el modal de aceptación.
 */
export const RUTAS_ABIERTAS = ['/aviso-de-privacidad'];

export const esRutaAbierta = (pathname: string) =>
  RUTAS_ABIERTAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
