import {
  AVISO_PRIVACIDAD_VERSION,
  requiereConsentimiento,
} from './aviso-privacidad.constants';

describe('Reaceptación del aviso de privacidad', () => {
  const v1 = { version: '2026-11-v1' };
  const vigente = { version: AVISO_PRIVACIDAD_VERSION };

  it('la versión vigente es la 2026-11-v2', () => {
    expect(AVISO_PRIVACIDAD_VERSION).toBe('2026-11-v2');
  });

  it('un postulante que aceptó la v1 debe aceptar la versión vigente', () => {
    expect(
      requiereConsentimiento({ rol: 'postulante', privacyConsent: v1 }),
    ).toBe(true);
  });

  it('un postulante sin consentimiento también debe aceptarla', () => {
    expect(requiereConsentimiento({ rol: 'postulante' })).toBe(true);
    expect(
      requiereConsentimiento({ rol: 'postulante', privacyConsent: null }),
    ).toBe(true);
  });

  it('un postulante con la versión vigente no tiene que aceptar de nuevo', () => {
    expect(
      requiereConsentimiento({ rol: 'postulante', privacyConsent: vigente }),
    ).toBe(false);
  });

  it.each(['evaluador', 'administrador'])(
    'no bloquea a %s, tenga la v1, ninguna o la vigente',
    (rol) => {
      for (const privacyConsent of [v1, vigente, undefined, null]) {
        expect(requiereConsentimiento({ rol, privacyConsent })).toBe(false);
      }
    },
  );
});
