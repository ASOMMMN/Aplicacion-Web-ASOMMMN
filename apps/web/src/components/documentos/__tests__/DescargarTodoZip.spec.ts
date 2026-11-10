import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DescargarTodoZipVista, type DescargarTodoZipVistaProps } from '../DescargarTodoZip';
import { MENSAJES_ZIP } from '@/lib/descargaZipExpediente';

const MB = 1024 * 1024;

function render(props: Partial<DescargarTodoZipVistaProps> = {}) {
  return renderToStaticMarkup(
    createElement(DescargarTodoZipVista, {
      totalArchivos: 3,
      bytesEstimados: 2 * MB,
      preparando: false,
      error: null,
      onDescargar: () => undefined,
      onCerrarError: () => undefined,
      ...props,
    }),
  );
}

/** Etiqueta <button ...> del botón de descarga. */
const boton = (html: string) => /<button[^>]*data-testid="btn-descargar-todo-zip"[^>]*>/.exec(html)?.[0] ?? '';

describe('DescargarTodoZipVista', () => {
  it('con documentos: botón "Descargar todo (ZIP)" habilitado y resumen', () => {
    const html = render();
    expect(html).toContain('Descargar todo (ZIP)');
    expect(boton(html)).not.toContain('disabled');
    expect(html).toContain('3 archivos · ~2.0 MB');
  });

  it('sin documentos: deshabilitado con el motivo visible', () => {
    const html = render({ totalArchivos: 0, bytesEstimados: 0 });
    expect(boton(html)).toContain('disabled');
    expect(html).toContain(MENSAJES_ZIP.sinDocumentos);
  });

  it('preparando: muestra "Preparando descarga…" y bloquea un segundo clic', () => {
    const html = render({ preparando: true });
    expect(html).toContain('Preparando descarga…');
    expect(html).not.toContain('Descargar todo (ZIP)');
    expect(boton(html)).toContain('disabled');
    expect(boton(html)).toContain('aria-busy="true"');
  });

  it('expediente pesado: avisa que puede tardar mientras se prepara', () => {
    expect(render({ preparando: true, bytesEstimados: 200 * MB })).toContain('puede tardar varios minutos');
    expect(render({ preparando: true, bytesEstimados: 20 * MB })).not.toContain('puede tardar');
  });

  it('muestra el error en español en una alerta', () => {
    const html = render({ error: 'No se pudo preparar la descarga. Inténtalo de nuevo.' });
    expect(html).toContain('alert-danger');
    expect(html).toContain('No se pudo preparar la descarga. Inténtalo de nuevo.');
  });
});
