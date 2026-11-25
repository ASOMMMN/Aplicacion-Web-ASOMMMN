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

/** Mismo estilo visual en todos los casos. */
const ESTILO = 'class="btn btn-sm btn-outline-light"';

describe('Botón del encabezado de /aviso-de-privacidad (siempre hay uno)', () => {
  describe('1. con sesión, viniendo de otra página de la plataforma: "Volver"', () => {
    it.each([
      ['navegación interna (enlace del pie de página)', directo({ rol: 'postulante', historial: 4, rutaInicial: '/dashboard' })],
      ['carga completa con referrer del mismo origen', directo({ rol: 'evaluador', historial: 2, referrer: `${ORIGEN}/candidatos` })],
    ])('%s', (_caso, contexto) => {
      const decision = decidirBotonAviso(contexto);
      expect(decision).toEqual({ tipo: 'volver' });
      const html = vista(decision);
      expect(html).toContain('<button');
      expect(html).toContain('Volver');
      expect(html).toContain(ESTILO);
    });
  });

  describe('2. con sesión, llegando directo: "Ir a mi panel" al inicio de su rol', () => {
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
      expect(html).toContain(ESTILO);
    });
  });

  describe('3. sin sesión, viniendo de otra página de la plataforma: "Volver"', () => {
    it.each([
      ['desde /login (enlace en la misma pestaña, navegación interna)', directo({ historial: 3, rutaInicial: '/login' })],
      ['desde /registro con carga completa y referrer del mismo origen', directo({ historial: 2, referrer: `${ORIGEN}/registro` })],
    ])('%s', (_caso, contexto) => {
      const decision = decidirBotonAviso(contexto);
      expect(decision).toEqual({ tipo: 'volver' });
      expect(vista(decision)).toContain('Volver');
    });
  });

  describe('4. sin sesión, llegando directo: "Ir al inicio de sesión" → /login', () => {
    it.each([
      ['pestaña nueva sin referrer', directo()],
      // El enlace del registro abre el aviso en una pestaña nueva, sin
      // referrer ni historial: no hay a dónde volver.
      ['enlace del registro en pestaña nueva', directo({ referrer: '' })],
      ['referrer del mismo origen pero sin historial', directo({ referrer: `${ORIGEN}/registro` })],
      ['referrer de otro sitio', directo({ historial: 3, referrer: 'https://otro.ejemplo/' })],
      ['cookie con un rol que la app no conoce', directo({ rol: 'intruso' })],
    ])('%s', (_caso, contexto) => {
      const decision = decidirBotonAviso(contexto);
      expect(decision).toEqual({ tipo: 'login', href: '/login' });
      const html = vista(decision);
      expect(html).toContain('href="/login"');
      expect(html).toContain('Ir al inicio de sesión');
      expect(html).toContain(ESTILO);
    });
  });

  it('con sesión y abierto en pestaña nueva (sin historial) no ofrece "Volver"', () => {
    expect(decidirBotonAviso(directo({ rol: 'postulante', referrer: `${ORIGEN}/dashboard` }))).toEqual({
      tipo: 'panel',
      href: '/dashboard',
    });
  });

  it('mientras no se sabe qué mostrar no pinta nada (ni en el servidor)', () => {
    expect(vista(null)).toBe('');
    expect(renderToStaticMarkup(createElement(BotonEncabezadoAviso))).toBe('');
  });
});
