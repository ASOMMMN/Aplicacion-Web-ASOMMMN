import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import AvisoPrivacidadContenido from '@/components/legal/AvisoPrivacidadContenido';
import { esRutaAbierta, esRutaPublica } from '@/lib/auth/rutasPublicas';
import { registerSchema } from '@/lib/validators/auth';
import {
  AVISO_PRIVACIDAD_VERSION,
  AVISO_PRIVACIDAD_VIGENCIA,
  CODIGO_CONSENTIMIENTO_PENDIENTE,
  URL_AVISO_GENERAL_ASOMMMN,
  consentimientoRegistro,
} from '../avisoPrivacidad';

describe('Aviso de privacidad (P-01)', () => {
  it('la versión y el código del 403 coinciden con los de la API', () => {
    const api = readFileSync(
      join(__dirname, '../../../../../api/src/modules/privacidad/aviso-privacidad.constants.ts'),
      'utf8',
    );
    expect(api).toContain(`AVISO_PRIVACIDAD_VERSION = '${AVISO_PRIVACIDAD_VERSION}'`);
    expect(api).toContain(`CODIGO_CONSENTIMIENTO_PENDIENTE = '${CODIGO_CONSENTIMIENTO_PENDIENTE}'`);
    expect(AVISO_PRIVACIDAD_VERSION).toBe('2026-11-v1');
  });

  it('el registro manda la casilla marcada y la versión vigente', () => {
    expect(consentimientoRegistro()).toEqual({ accepted: true, version: AVISO_PRIVACIDAD_VERSION });
  });

  it('el formulario de registro exige la casilla', () => {
    const base = {
      nombre: 'Ana',
      apellidos: 'Prueba',
      email: 'ana@prueba.mx',
      password: 'Gaviota-Norte-42',
      confirmar: 'Gaviota-Norte-42',
    };
    expect(registerSchema.safeParse({ ...base, aceptaAviso: false }).success).toBe(false);
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, aceptaAviso: true }).success).toBe(true);
  });

  it('/aviso-de-privacidad se abre con o sin sesión y no es una pantalla de login', () => {
    expect(esRutaAbierta('/aviso-de-privacidad')).toBe(true);
    expect(esRutaAbierta('/aviso-de-privacidad/')).toBe(true);
    expect(esRutaAbierta('/aviso-de-privacidad-falso')).toBe(false);
    expect(esRutaAbierta('/dashboard')).toBe(false);
    expect(esRutaPublica('/aviso-de-privacidad')).toBe(false);
  });

  it('el contenido trae el responsable oficial, la sección de la plataforma y la versión', () => {
    const html = renderToStaticMarkup(createElement(AvisoPrivacidadContenido));
    expect(html).toContain('Avenida Víctimas del 25 de Junio No. 176');
    expect(html).toContain('asommmn@asommmn.org.mx');
    expect(html).toContain('(229) 932 2807 / (229) 932 8737');
    expect(html).toContain('Plataforma de Evaluación Curricular (postulantes)');
    for (const dato of ['INE', 'CURP', 'pasaporte', 'visa', 'STCW/OMI']) {
      expect(html).toContain(dato);
    }
    expect(html).toContain(AVISO_PRIVACIDAD_VERSION);
    expect(html).toContain(`href="${URL_AVISO_GENERAL_ASOMMMN}"`);
    // Sin marcadores pendientes y con los datos que definió ASOMMMN.
    expect(html).not.toContain('POR COMPLETAR');
    expect(html).toContain(AVISO_PRIVACIDAD_VIGENCIA);
    expect(html).toContain('no utiliza sus datos personales para finalidades');
    expect(html).toContain('OpenAI');
    expect(html).toContain('Amazon Web Services');
    expect(html).toContain('MongoDB Atlas');
    expect(html).toContain('No se transfieren datos personales a terceros');
    expect(html).toContain('durante 1 año');
    expect(html).toContain('por el tiempo necesario para cumplir');
  });
});
