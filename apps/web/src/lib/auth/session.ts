'use client';

// El access token vive en memoria (no en localStorage ni en cookie accesible).
// El refresh token vive en una cookie httpOnly que gestiona el backend.

let _accessToken: string | null = null;
let _userRole: string | null = null;

export const session = {
  getToken: () => _accessToken,
  getRole: () => _userRole,

  set(token: string, role: string) {
    _accessToken = token;
    _userRole = role;
    (window as Window & { __asommmn_token?: string | null }).__asommmn_token = token;
    // Cookie no-httpOnly solo para que el middleware de Next.js pueda leer el rol
    document.cookie = `user_role=${role}; path=/; SameSite=Strict`;
  },

  clear() {
    _accessToken = null;
    _userRole = null;
    (window as Window & { __asommmn_token?: string | null }).__asommmn_token = null;
    document.cookie = 'user_role=; path=/; Max-Age=0';
  },

  isAuthenticated: () => _accessToken !== null,
};
