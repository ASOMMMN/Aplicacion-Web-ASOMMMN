/**
 * Decodifica el payload de un access token JWT sin verificar la firma — solo
 * para leer id/email en el cliente (la autorización real ya la hizo el
 * backend al emitir el token). Nunca uses esto para validar un token.
 */
export function decodeAccessToken(token: string): { sub?: string; email?: string } | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return null;
  }
}
