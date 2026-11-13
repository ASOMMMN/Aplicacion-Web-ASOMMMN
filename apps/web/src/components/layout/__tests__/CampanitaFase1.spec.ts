import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  GrupoNotificacionesApp,
  NotificacionAppItem,
} from '@/lib/api/notificaciones';
import {
  GrupoAvisos,
  PanelNotificacionesVista,
  type PanelNotificacionesVistaProps,
} from '../PanelNotificaciones';
import {
  HistorialNotificacionesVista,
  type HistorialNotificacionesVistaProps,
} from '../HistorialNotificacionesVista';
import {
  MENSAJES_CAMPANA,
  agruparPorDia,
  enlaceDetalleGrupo,
  filtroDesdeUrl,
  marcarAvisoEnGrupos,
  marcarGrupoLeido,
  marcarTodosEnGrupos,
  parametrosListado,
  tituloDia,
  totalPaginas,
} from '@/lib/notificacionesCampana';

// 11 nov 2026, 12:00 en México.
const AHORA = new Date('2026-11-11T18:00:00.000Z');

let n = 0;
const aviso = (over: Partial<NotificacionAppItem> = {}): NotificacionAppItem => ({
  _id: `a${++n}`,
  tipo: 'nuevo_candidato',
  candidatoId: '665f1c2a9b1e8a0012345678',
  nombreCandidato: 'Ana Pérez',
  mensaje: 'Ana Pérez se registró como postulante.',
  enlace: '/candidato/665f1c2a9b1e8a0012345678',
  fecha: '2026-11-11T17:55:00.000Z',
  leida: false,
  cantidad: 1,
  ...over,
});

const grupo = (over: Partial<GrupoNotificacionesApp> = {}): GrupoNotificacionesApp => {
  const items = over.items ?? [aviso(), aviso({ candidatoId: 'c2' }), aviso({ leida: true })];
  return {
    clave: '2026-11-11|nuevo_candidato',
    tipo: 'nuevo_candidato',
    dia: '2026-11-11',
    cantidad: items.length,
    noLeidas: items.filter((i) => !i.leida).length,
    resumen: `${items.length} postulantes nuevos hoy`,
    fecha: '2026-11-11T17:55:00.000Z',
    hayMas: false,
    ...over,
    items,
  };
};

/**
 * Expande el árbol de elementos llamando a los componentes (son vistas sin
 * hooks), para encontrar botones por data-testid y "hacer clic" en Node.
 */
function expandir(nodo: ReactNode): ReactElement[] {
  if (Array.isArray(nodo)) return nodo.flatMap(expandir);
  if (!isValidElement(nodo)) return [];
  const el = nodo as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    return expandir((el.type as (p: unknown) => ReactNode)(el.props));
  }
  return [el, ...expandir(el.props.children as ReactNode)];
}
const porTestId = (raiz: ReactNode, id: string) =>
  expandir(raiz).filter(
    (e) => (e.props as Record<string, unknown>)['data-testid'] === id,
  ) as ReactElement<Record<string, (...a: unknown[]) => void>>[];
const clic = (el: ReactElement<Record<string, (...a: unknown[]) => void>>) =>
  el.props.onClick({ preventDefault: () => undefined });

function panel(props: Partial<PanelNotificacionesVistaProps> = {}) {
  const p: PanelNotificacionesVistaProps = {
    grupos: [grupo()],
    vencimientos: [],
    noLeidas: 2,
    pestana: 'todas',
    cargando: false,
    error: null,
    ahora: AHORA,
    onRevisar: jest.fn(),
    onMarcarLeida: jest.fn(),
    onCambiarPestana: jest.fn(),
    onAbrirVencimiento: jest.fn(),
    onMarcarTodas: jest.fn(),
    onReintentar: jest.fn(),
    onNavegar: jest.fn(),
    ...props,
  };
  return { p, el: createElement(PanelNotificacionesVista, p) };
}

describe('Campanita — pestañas Todas / No leídas', () => {
  it('marca la pestaña activa y muestra cuántas sin leer', () => {
    const html = renderToStaticMarkup(panel({ noLeidas: 4 }).el);
    expect(html).toMatch(/data-testid="pestana-todas"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-testid="pestana-todas"/);
    expect(html).toMatch(/aria-selected="false"[^>]*data-testid="pestana-no_leidas"/);
    expect(html).toContain('No leídas<span class="ms-1">(4)</span>');
    expect(html).toContain('role="tablist"');
  });

  it('cambiar de pestaña avisa solo si es otra', () => {
    const { p, el } = panel();
    clic(porTestId(el, 'pestana-no_leidas')[0]);
    clic(porTestId(el, 'pestana-todas')[0]);
    expect(p.onCambiarPestana).toHaveBeenCalledTimes(1);
    expect(p.onCambiarPestana).toHaveBeenCalledWith('no_leidas');
  });

  it('"No leídas" vacía tiene su propio mensaje y oculta vencimientos leídos', () => {
    const html = renderToStaticMarkup(
      panel({
        grupos: [],
        noLeidas: 0,
        pestana: 'no_leidas',
        vencimientos: [
          {
            _id: 'v1',
            tipo: 'curso_por_vencer',
            candidatoId: 'c',
            cursoId: 'k',
            nombreCandidato: 'Luis',
            nombreCurso: 'Supervivencia',
            fechaVencimiento: '2026-12-01',
            diasAnticipacion: 30,
            diasRestantes: 20,
            leida: true,
            fechaCreacion: '2026-11-01T00:00:00.000Z',
          },
        ],
      }).el,
    );
    expect(html).toContain(MENSAJES_CAMPANA.vacioNoLeidas);
    expect(html).not.toContain('Supervivencia');
  });
});

describe('Campanita — agrupación por día', () => {
  it('varios del mismo tipo y día: una línea resumida con el detalle dentro', () => {
    const html = renderToStaticMarkup(panel().el);
    expect(html).toContain('<details');
    expect(html).toContain('3 postulantes nuevos hoy');
    expect(html).toContain('data-testid="grupo-avisos"');
    // El detalle sigue accesible: los 3 avisos están dentro del grupo.
    expect((html.match(/data-testid="aviso-campana"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/badge-grupo-avisos">2<span class="visually-hidden"> sin leer/);
  });

  it('un solo aviso en el grupo se ve tal cual, sin resumen', () => {
    const solo = aviso({ mensaje: 'Luis Mar completó su expediente (100 %).', tipo: 'expediente_completo' });
    const html = renderToStaticMarkup(panel({ grupos: [grupo({ items: [solo], resumen: 'NO' })] }).el);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('NO');
    expect(html).toContain('Luis Mar completó su expediente (100 %).');
    expect(html).toContain('bi-folder-check');
  });

  it('iconos de los tipos nuevos', () => {
    const html = renderToStaticMarkup(
      panel({
        grupos: [
          grupo({ clave: 'd', items: [aviso({ tipo: 'documento_subido' })] }),
          grupo({ clave: 'e', items: [aviso({ tipo: 'expediente_evaluado' })] }),
          grupo({ clave: 'i', items: [aviso({ tipo: 'candidato_inactivo' })] }),
        ],
      }).el,
    );
    expect(html).toContain('bi-file-earmark-arrow-up');
    expect(html).toContain('bi-clipboard-check');
    expect(html).toContain('bi-hourglass-split');
  });

  it('si el grupo trae menos de los que hay, enlaza al detalle completo', () => {
    const g = grupo({ cantidad: 25, hayMas: true });
    const onNavegar = jest.fn();
    const el = createElement(GrupoAvisos, {
      grupo: g,
      onRevisar: jest.fn(),
      onMarcarLeida: jest.fn(),
      onNavegar,
    });
    expect(renderToStaticMarkup(el)).toContain('Ver los 25');
    clic(porTestId(el, 'btn-detalle-grupo')[0]);
    expect(onNavegar).toHaveBeenCalledWith('/notificaciones?tipo=nuevo_candidato&dia=2026-11-11');
  });
});

describe('Campanita — acciones por aviso', () => {
  it('"Revisar expediente" en cada aviso apunta al candidato y llama a onRevisar', () => {
    const { p, el } = panel();
    const html = renderToStaticMarkup(el);
    expect((html.match(/Revisar expediente/g) ?? []).length).toBe(3);
    expect(html).toContain('href="/candidato/665f1c2a9b1e8a0012345678"');
    const botones = porTestId(el, 'btn-revisar-expediente');
    clic(botones[1]);
    expect(p.onRevisar).toHaveBeenCalledWith(expect.objectContaining({ candidatoId: 'c2' }));
  });

  it('"Marcar leída" solo en las no leídas', () => {
    const { p, el } = panel();
    const botones = porTestId(el, 'btn-marcar-leida');
    expect(botones).toHaveLength(2);
    clic(botones[0]);
    expect(p.onMarcarLeida).toHaveBeenCalledWith(expect.objectContaining({ leida: false }));
  });

  it('"Ver todas" lleva al historial', () => {
    const { p, el } = panel();
    clic(porTestId(el, 'btn-ver-todas')[0]);
    expect(p.onNavegar).toHaveBeenCalledWith('/notificaciones');
  });

  it('"Marcar todas" llama a su acción', () => {
    const { p, el } = panel();
    clic(porTestId(el, 'btn-marcar-todas')[0]);
    expect(p.onMarcarTodas).toHaveBeenCalled();
  });
});

describe('Estado local de grupos', () => {
  const estado = () => ({ grupos: [grupo(), grupo({ clave: 'otro', items: [aviso()] })], noLeidas: 3 });

  it('marcar un aviso baja el grupo y el total una sola vez', () => {
    const e = estado();
    const id = e.grupos[0].items[0]._id;
    const uno = marcarAvisoEnGrupos(e, id);
    expect(uno.noLeidas).toBe(2);
    expect(uno.grupos[0].noLeidas).toBe(1);
    expect(uno.grupos[0].items[0].leida).toBe(true);
    expect(marcarAvisoEnGrupos(uno, id)).toBe(uno);
    expect(marcarAvisoEnGrupos(uno, 'no-existe')).toBe(uno);
  });

  it('marcar un grupo baja el total por sus no leídas; marcar todas deja 0', () => {
    const g = marcarGrupoLeido(estado(), '2026-11-11|nuevo_candidato');
    expect(g.noLeidas).toBe(1);
    expect(g.grupos[0].items.every((i) => i.leida)).toBe(true);
    expect(g.grupos[1].noLeidas).toBe(1);
    expect(marcarGrupoLeido(g, '2026-11-11|nuevo_candidato')).toBe(g);
    const t = marcarTodosEnGrupos(g);
    expect(t.noLeidas).toBe(0);
    expect(t.grupos.every((x) => x.noLeidas === 0)).toBe(true);
  });
});

describe('Parámetros, URL y paginación', () => {
  it('agrupado por día; con tipo/día es la lista plana del grupo', () => {
    expect(parametrosListado({ pestana: 'todas', limite: 8 })).toEqual({
      pagina: 1,
      limite: 8,
      soloNoLeidas: undefined,
      tipo: undefined,
      dia: undefined,
      agrupar: 'dia',
    });
    expect(
      parametrosListado({ pestana: 'no_leidas', pagina: 3, limite: 50, tipo: 'documento_subido', dia: '2026-11-11' }),
    ).toMatchObject({ pagina: 3, soloNoLeidas: true, tipo: 'documento_subido', agrupar: undefined });
    expect(parametrosListado({ pestana: 'todas', pagina: 0, limite: 5 }).pagina).toBe(1);
  });

  it('filtro de la URL descarta valores inválidos', () => {
    const url = (q: string) => new URLSearchParams(q);
    expect(filtroDesdeUrl(url('tipo=documento_subido&dia=2026-11-11'))).toEqual({
      tipo: 'documento_subido',
      dia: '2026-11-11',
    });
    expect(filtroDesdeUrl(url('tipo=curso_por_vencer&dia=ayer'))).toEqual({
      tipo: undefined,
      dia: undefined,
    });
    expect(enlaceDetalleGrupo({ tipo: 'candidato_inactivo', dia: '2026-11-03' })).toBe(
      '/notificaciones?tipo=candidato_inactivo&dia=2026-11-03',
    );
  });

  it('totalPaginas', () => {
    expect(totalPaginas(0, 10)).toBe(1);
    expect(totalPaginas(10, 10)).toBe(1);
    expect(totalPaginas(11, 10)).toBe(2);
  });

  it('títulos de día: Hoy, Ayer y fecha larga', () => {
    expect(tituloDia('2026-11-11', AHORA)).toBe('Hoy');
    expect(tituloDia('2026-11-10', AHORA)).toBe('Ayer');
    expect(tituloDia('2026-11-03', AHORA)).toBe('Martes 3 de noviembre');
    expect(tituloDia('2025-12-31', AHORA)).toBe('Miércoles 31 de diciembre de 2025');
  });

  it('agruparPorDia respeta el orden de la API', () => {
    const dias = agruparPorDia([
      grupo({ clave: '1', dia: '2026-11-11' }),
      grupo({ clave: '2', dia: '2026-11-11', tipo: 'expediente_completo' }),
      grupo({ clave: '3', dia: '2026-11-10' }),
    ]);
    expect(dias.map((d) => [d.dia, d.grupos.map((g) => g.clave)])).toEqual([
      ['2026-11-11', ['1', '2']],
      ['2026-11-10', ['3']],
    ]);
  });
});

describe('/notificaciones — historial', () => {
  function historial(props: Partial<HistorialNotificacionesVistaProps> = {}) {
    const p: HistorialNotificacionesVistaProps = {
      pestana: 'todas',
      filtro: {},
      grupos: [
        grupo(),
        grupo({ clave: 'ayer', dia: '2026-11-10', items: [aviso({ mensaje: 'De ayer.' })] }),
      ],
      items: [],
      noLeidas: 3,
      pagina: 2,
      totalPaginas: 3,
      cargando: false,
      error: null,
      ahora: AHORA,
      onRevisar: jest.fn(),
      onMarcarLeida: jest.fn(),
      onCambiarPestana: jest.fn(),
      onPagina: jest.fn(),
      onMarcarGrupo: jest.fn(),
      onMarcarTodas: jest.fn(),
      onReintentar: jest.fn(),
      onNavegar: jest.fn(),
      ...props,
    };
    return { p, el: createElement(HistorialNotificacionesVista, p) };
  }

  it('agrupa por día con encabezados Hoy / Ayer', () => {
    const html = renderToStaticMarkup(historial().el);
    expect(html).toContain('>Hoy</h2>');
    expect(html).toContain('>Ayer</h2>');
    expect(html.indexOf('>Hoy<')).toBeLessThan(html.indexOf('>Ayer<'));
    expect(html).toContain('3 postulantes nuevos hoy');
    expect(html).toContain('De ayer.');
    expect(html).toContain('data-testid="pestana-todas"');
  });

  it('paginación: anterior/siguiente y página actual', () => {
    const { p, el } = historial();
    expect(renderToStaticMarkup(el)).toContain('Página 2 de 3');
    clic(porTestId(el, 'btn-pagina-siguiente')[0]);
    clic(porTestId(el, 'btn-pagina-anterior')[0]);
    expect(p.onPagina).toHaveBeenNthCalledWith(1, 3);
    expect(p.onPagina).toHaveBeenNthCalledWith(2, 1);
  });

  it('en los extremos los botones se deshabilitan; con 1 página no hay paginación', () => {
    const primera = renderToStaticMarkup(historial({ pagina: 1 }).el);
    expect(/<button[^>]*data-testid="btn-pagina-anterior"[^>]*>/.exec(primera)?.[0]).toContain('disabled');
    const ultima = renderToStaticMarkup(historial({ pagina: 3 }).el);
    expect(/<button[^>]*data-testid="btn-pagina-siguiente"[^>]*>/.exec(ultima)?.[0]).toContain('disabled');
    expect(renderToStaticMarkup(historial({ totalPaginas: 1 }).el)).not.toContain('Página');
  });

  it('marcar grupo, marcar todas y cambiar de pestaña', () => {
    const { p, el } = historial();
    clic(porTestId(el, 'btn-marcar-grupo')[0]);
    expect(p.onMarcarGrupo).toHaveBeenCalledWith(expect.objectContaining({ clave: '2026-11-11|nuevo_candidato' }));
    clic(porTestId(el, 'btn-marcar-todas')[0]);
    expect(p.onMarcarTodas).toHaveBeenCalled();
    clic(porTestId(el, 'pestana-no_leidas')[0]);
    expect(p.onCambiarPestana).toHaveBeenCalledWith('no_leidas');
  });

  it('detalle de un grupo: lista plana, filtro visible y "Ver todo el historial"', () => {
    const { p, el } = historial({
      filtro: { tipo: 'documento_subido', dia: '2026-11-11' },
      grupos: [],
      items: [aviso({ tipo: 'documento_subido', mensaje: 'Ana Pérez subió 2 documentos: CURP, INE.' })],
      totalPaginas: 1,
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('Documentos subidos · hoy');
    expect(html).toContain('Ana Pérez subió 2 documentos: CURP, INE.');
    expect(html).not.toContain('<h2');
    clic(porTestId(el, 'btn-quitar-filtro')[0]);
    expect(p.onNavegar).toHaveBeenCalledWith('/notificaciones');
  });

  it('error y vacío', () => {
    const conError = renderToStaticMarkup(historial({ grupos: [], error: MENSAJES_CAMPANA.errorCarga }).el);
    expect(conError).toContain('alert-danger');
    expect(conError).not.toContain(MENSAJES_CAMPANA.vacio);
    expect(renderToStaticMarkup(historial({ grupos: [], pestana: 'no_leidas' }).el)).toContain(
      MENSAJES_CAMPANA.vacioNoLeidas,
    );
  });
});
