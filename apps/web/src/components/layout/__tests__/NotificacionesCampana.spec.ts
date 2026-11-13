import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  GrupoNotificacionesApp,
  NotificacionAppItem,
  NotificacionItem,
} from '@/lib/api/notificaciones';
import {
  ContadorCampana,
  PanelNotificacionesVista,
  type PanelNotificacionesVistaProps,
} from '../PanelNotificaciones';
import {
  MENSAJES_CAMPANA,
  abrirAviso,
  enlaceCandidato,
  fechaRelativa,
  marcarAvisoLeido,
  marcarTodosAvisosLeidos,
  textoContador,
} from '@/lib/notificacionesCampana';

const AHORA = new Date('2026-11-10T18:00:00.000Z');

const aviso = (over: Partial<NotificacionAppItem> = {}): NotificacionAppItem => ({
  _id: 'a1',
  tipo: 'nuevo_candidato',
  candidatoId: '665f1c2a9b1e8a0012345678',
  nombreCandidato: 'Ana Pérez',
  mensaje: 'Ana Pérez se registró como postulante.',
  enlace: '/candidato/665f1c2a9b1e8a0012345678',
  fecha: '2026-11-10T17:55:00.000Z',
  leida: false,
  ...over,
});

/** Cada aviso en su propio grupo (así se ve tal cual, sin resumen). */
const solos = (avisos: NotificacionAppItem[]): GrupoNotificacionesApp[] =>
  avisos.map((a) => ({
    clave: `${a._id}|${a.tipo}`,
    tipo: a.tipo,
    dia: a.fecha.slice(0, 10),
    cantidad: 1,
    noLeidas: a.leida ? 0 : 1,
    resumen: '',
    fecha: a.fecha,
    items: [a],
    hayMas: false,
  }));

const vencimiento: NotificacionItem = {
  _id: 'v1',
  tipo: 'curso_por_vencer',
  candidatoId: 'c1',
  cursoId: 'k1',
  nombreCandidato: 'Luis Mar',
  nombreCurso: 'Supervivencia en el mar',
  fechaVencimiento: '2026-12-01',
  diasAnticipacion: 30,
  diasRestantes: 21,
  leida: false,
  fechaCreacion: '2026-11-01T00:00:00.000Z',
};

function render(
  props: Partial<PanelNotificacionesVistaProps> & { avisos?: NotificacionAppItem[] } = {},
) {
  const { avisos = [aviso()], ...resto } = props;
  return renderToStaticMarkup(
    createElement(PanelNotificacionesVista, {
      grupos: solos(avisos),
      vencimientos: [],
      noLeidas: 1,
      pestana: 'todas',
      cargando: false,
      error: null,
      ahora: AHORA,
      onRevisar: () => undefined,
      onMarcarLeida: () => undefined,
      onCambiarPestana: () => undefined,
      onAbrirVencimiento: () => undefined,
      onMarcarTodas: () => undefined,
      onReintentar: () => undefined,
      onNavegar: () => undefined,
      ...resto,
    }),
  );
}

const contar = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('Campanita — contador', () => {
  it('muestra el número de no leídas en la insignia', () => {
    const html = renderToStaticMarkup(createElement(ContadorCampana, { noLeidas: 3 }));
    expect(html).toContain('data-testid="contador-campana"');
    expect(html).toContain('>3<');
    expect(html).toContain('sin leer');
  });

  it('sin no leídas no hay insignia; más de 99 muestra 99+', () => {
    expect(renderToStaticMarkup(createElement(ContadorCampana, { noLeidas: 0 }))).toBe('');
    expect(textoContador(0)).toBeNull();
    expect(textoContador(-2)).toBeNull();
    expect(textoContador(7)).toBe('7');
    expect(textoContador(150)).toBe('99+');
  });
});

describe('Campanita — panel', () => {
  it('lista el texto, la fecha relativa y marca las no leídas', () => {
    const html = render({
      avisos: [
        aviso(),
        aviso({
          _id: 'a2',
          tipo: 'expediente_completo',
          mensaje: 'Luis Mar completó su expediente (100 %).',
          fecha: '2026-11-09T12:00:00.000Z',
          leida: true,
        }),
      ],
    });
    expect(html).toContain('Ana Pérez se registró como postulante.');
    expect(html).toContain('Luis Mar completó su expediente (100 %).');
    expect(html).toContain('hace 5 min');
    expect(html).toContain('ayer');
    expect(html).toContain('dateTime="2026-11-10T17:55:00.000Z"');
    expect(contar(html, /notificacion-no-leida/g)).toBe(1);
    expect(html).toContain('bi-person-plus');
    expect(html).toContain('bi-folder-check');
  });

  it('botón "Marcar todas como leídas" solo si hay no leídas', () => {
    expect(render()).toContain(MENSAJES_CAMPANA.marcarTodas);
    expect(render({ noLeidas: 0 })).not.toContain(MENSAJES_CAMPANA.marcarTodas);
    const ocupado = /<button[^>]*data-testid="btn-marcar-todas"[^>]*>/.exec(
      render({ marcandoTodas: true }),
    )?.[0];
    expect(ocupado).toContain('disabled');
  });

  it('convive con los vencimientos (dos secciones)', () => {
    const html = render({ vencimientos: [vencimiento], noLeidas: 2 });
    expect(html).toContain(MENSAJES_CAMPANA.seccionCandidatos);
    expect(html).toContain(MENSAJES_CAMPANA.seccionVencimientos);
    expect(html).toContain('Supervivencia en el mar');
    expect(html).toContain('Vence en 21 días');
  });

  it('solo vencimientos: se ven como antes, sin encabezados de sección', () => {
    const html = render({ avisos: [], vencimientos: [vencimiento] });
    expect(html).toContain('Luis Mar');
    expect(html).not.toContain(MENSAJES_CAMPANA.seccionCandidatos);
  });

  it('estados de carga, vacío y error en español', () => {
    expect(render({ avisos: [], cargando: true })).toContain(MENSAJES_CAMPANA.cargando);
    expect(render({ avisos: [], noLeidas: 0 })).toContain('Sin notificaciones por ahora.');
    const conError = render({ avisos: [], error: MENSAJES_CAMPANA.errorCarga });
    expect(conError).toContain('alert-danger');
    expect(conError).toContain('No se pudieron cargar las notificaciones');
    expect(conError).toContain('Reintentar');
    expect(conError).not.toContain('Sin notificaciones por ahora.');
  });
});

describe('Campanita — marcar leída y marcar todas', () => {
  const estado = () => ({
    items: [aviso(), aviso({ _id: 'a2' }), aviso({ _id: 'a3', leida: true })],
    noLeidas: 2,
  });

  it('marcar una baja el contador solo una vez', () => {
    const uno = marcarAvisoLeido(estado(), 'a1');
    expect(uno.noLeidas).toBe(1);
    expect(uno.items.find((n) => n._id === 'a1')?.leida).toBe(true);
    expect(uno.items.find((n) => n._id === 'a2')?.leida).toBe(false);
    expect(marcarAvisoLeido(uno, 'a1')).toBe(uno); // ya leída
    expect(marcarAvisoLeido(uno, 'a3')).toBe(uno);
    expect(marcarAvisoLeido(uno, 'no-existe')).toBe(uno);
  });

  it('marcar todas deja el contador en 0', () => {
    const todas = marcarTodosAvisosLeidos(estado());
    expect(todas.noLeidas).toBe(0);
    expect(todas.items.every((n) => n.leida)).toBe(true);
  });

  it('al tocar una no leída: la marca y navega al candidato', async () => {
    const orden: string[] = [];
    const deps = {
      marcarLeida: jest.fn(async () => {
        orden.push('api');
      }),
      alMarcar: jest.fn(() => orden.push('local')),
      navegar: jest.fn(() => orden.push('navegar')),
    };
    await abrirAviso(aviso(), deps);
    expect(deps.marcarLeida).toHaveBeenCalledWith('a1');
    expect(deps.alMarcar).toHaveBeenCalledWith('a1');
    expect(deps.navegar).toHaveBeenCalledWith('/candidato/665f1c2a9b1e8a0012345678');
    expect(orden).toEqual(['local', 'api', 'navegar']);
  });

  it('una ya leída solo navega; si la API falla, navega igual', async () => {
    const leida = { marcarLeida: jest.fn(), alMarcar: jest.fn(), navegar: jest.fn() };
    await abrirAviso(aviso({ leida: true }), leida);
    expect(leida.marcarLeida).not.toHaveBeenCalled();
    expect(leida.navegar).toHaveBeenCalled();

    const falla = {
      marcarLeida: jest.fn().mockRejectedValue(new Error('red')),
      alMarcar: jest.fn(),
      navegar: jest.fn(),
    };
    await expect(abrirAviso(aviso(), falla)).resolves.toBeUndefined();
    expect(falla.navegar).toHaveBeenCalled();
  });

  it('el enlace se arma con el id del candidato (escapado)', () => {
    expect(enlaceCandidato({ candidatoId: 'abc' })).toBe('/candidato/abc');
    expect(enlaceCandidato({ candidatoId: '../x?y' })).toBe('/candidato/..%2Fx%3Fy');
  });
});

describe('fechaRelativa', () => {
  const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();
  it.each([
    [10_000, 'hace un momento'],
    [5 * 60_000, 'hace 5 min'],
    [3 * 3_600_000, 'hace 3 h'],
    [30 * 3_600_000, 'ayer'],
    [4 * 86_400_000, 'hace 4 días'],
  ])('%i ms → %s', (ms, esperado) => {
    expect(fechaRelativa(hace(ms), AHORA)).toBe(esperado);
  });

  it('más de una semana: fecha corta', () => {
    expect(fechaRelativa('2026-10-01T18:00:00.000Z', AHORA)).toMatch(/1 oct.* 2026/);
  });
});
