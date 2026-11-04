import {
  MENSAJE_IA_GENERICO,
  MENSAJE_IA_OCUPADO,
  mensajeIaParaUsuario,
} from './mensaje-ia-usuario.util';
import {
  MENSAJE_LIMITE_POR_MINUTO,
  MENSAJE_SIN_SALDO,
} from './openai-errores.util';

describe('mensajeIaParaUsuario', () => {
  it('caso QA: el 429 sin créditos de OpenAI con enlace de facturación → genérico', () => {
    const crudo =
      '429 You have no credits remaining. Visit https://platform.openai.com/settings/organization/billing to add credits.';
    const m = mensajeIaParaUsuario(crudo);
    expect(m).toBe(MENSAJE_IA_GENERICO);
    expect(m).not.toMatch(/https?:|openai|billing|credits/i);
  });

  it.each([
    `${MENSAJE_SIN_SALDO} (insufficient_quota).`,
    'Error de OpenAI: API key inválida o revocada (HTTP 401).',
    'Error de OpenAI (HTTP 500): The server had an error',
    'You exceeded your current quota, please check your plan',
    'OPENAI_API_KEY no configurada',
  ])('mensajes del proveedor → genérico: %s', (crudo) => {
    expect(mensajeIaParaUsuario(crudo)).toBe(MENSAJE_IA_GENERICO);
  });

  it('el límite por minuto → "servicio ocupado", sin nombrar al proveedor', () => {
    const m = mensajeIaParaUsuario(
      `${MENSAJE_LIMITE_POR_MINUTO} (rate_limit_exceeded).`,
    );
    expect(m).toBe(MENSAJE_IA_OCUPADO);
    expect(m).not.toMatch(/openai|rate_limit/i);
  });

  it('los mensajes propios en español se conservan', () => {
    for (const propio of [
      'El PDF no contiene suficiente texto legible.',
      'Formato no compatible. Sube un PDF, JPG o PNG.',
      'El CV es de un almacenamiento anterior y ya no está disponible. Pide que vuelva a subirlo.',
    ]) {
      expect(mensajeIaParaUsuario(propio)).toBe(propio);
    }
  });

  it('null/undefined → undefined; vacío se conserva', () => {
    expect(mensajeIaParaUsuario(undefined)).toBeUndefined();
    expect(mensajeIaParaUsuario(null)).toBeUndefined();
    expect(mensajeIaParaUsuario('')).toBe('');
  });
});
