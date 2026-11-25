import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn() }) }));

import BotonEncabezadoAviso, {
  BotonEncabezadoAvisoVista,
} from '@/components/legal/BotonEncabezadoAviso';
import {
  type ContextoNavegacion,
  decidirBotonAviso,
} from '../botonEncabezadoAviso';

const ORIGEN = 'https://plataforma.ejemplo';

/** Contexto base: pestaña nueva abierta directo en el aviso. */
const directo = (extra: Partial<ContextoNavegacion> = {}): ContextoNavegacion => ({
  rol: null,
  historial: 1,
  referrer: '',
  origen: ORIGEN,
  rutaInicial: '/aviso-de-privacidad',
  rutaActual: '/aviso-de-privacidad',
  ...extra,
});

const vista = (decision: Parameters<typeof BotonEncabezadoAvisoVista>[0]['decision']) =>
  renderToStaticMarkup(createElement(BotonEncabezadoAvisoVista, { decision, onVolver: () => {} }));

describe('Botón del encabezado de /aviso-de-privacidad', () => {
  describe('sin sesión: sin botón', () => {
    it.each([
      ['llegando directo', directo()],
      ['viniendo del login', directo({ historial: 3, referrer: `${ORIGEN}/login` })],
      ['con una cookie de rol desconocido', directo({ rol: 'intruso', historial: 3 })],
    ])('%s', (_caso, contexto) => {
      const decision = decidirBotonAviso(contexto);
      expect(decision).toEqual({ tipo: 'ninguno' });
      expect(vista(decision)).toBe('');
    });
  });

  describe('con sesión viniendo de otra página de la plataforma: "Volver"', () => {
    it.each([
      [
        'navegación interna sin recargar (p. ej. el enlace del pie de página)',
        directo({ rol: 'postulante', historial: 4, rutaInicial: '/dashboard' }),
      ],
      [
        'carga completa con referrer del mismo origen',
        directo({ rol: 'evaluador', historial: 2, referrer: `${ORIGEN}/candidatos` }),
      ],
    ])('%s', (_caso, contexto) => {
      const decision = decidirBotonAviso(contexto);
      expect(decision).toEqual({ tipo: 'volver' });
      const html = vista(decision);
      expect(html).toContain('<button');
      expect(html).toContain('Volver');
      expect(html).not.toContain('Ir a mi panel');
    });
  });

  describe('con sesión llegando directo: "Ir a mi panel" al inicio de su rol', () => {
    it.each([
      ['postulante', '/dashboard'],
      ['evaluador', '/candidatos'],
      ['administrador', '/usuarios'],
    ])('%s → %s', (rol, inicio) => {
      const decision = decidirBotonAviso(directo({ rol }));
      expect(decision).toEqual({ tipo: 'panel', href: inicio });
      const html = vista(decision);
      expect(html).toContain(`href="${inicio}"`);
      expect(html).toContain('Ir a mi panel');
      expect(html).not.toContain('Volver');
    });

    it.each([
      ['referrer de otro sitio', directo({ rol: 'postulante', historial: 3, referrer: 'https://otro.ejemplo/' })],
      ['referrer del mismo origen pero sin historial', directo({ rol: 'postulante', referrer: `${ORIGEN}/dashboard` })],
      ['referrer inválido', directo({ rol: 'postulante', historial: 3, referrer: 'no es una url' })],
    ])('%s', (_caso, contexto) => {
      expect(decidirBotonAviso(contexto)).toEqual({ tipo: 'panel', href: '/dashboard' });
    });
  });

  it('en el servidor no pinta nada (no aparece y desaparece al cargar)', () => {
    expect(renderToStaticMarkup(createElement(BotonEncabezadoAviso))).toBe('');
  });
});
