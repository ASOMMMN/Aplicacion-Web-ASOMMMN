'use client';

import type { ModoMejora } from '@/lib/scanner/tipos';

const MODOS: Array<{ modo: ModoMejora; etiqueta: string; icono: string; ayuda: string }> = [
  { modo: 'color', etiqueta: 'Color', icono: 'bi-palette', ayuda: 'Recomendado para INE, pasaporte y documentos con foto o sellos' },
  { modo: 'gris', etiqueta: 'Escala de grises', icono: 'bi-circle-half', ayuda: 'Más ligero, conserva los tonos' },
  { modo: 'bn', etiqueta: 'Blanco y negro', icono: 'bi-file-earmark-text', ayuda: 'Ideal para hojas de solo texto' },
  { modo: 'original', etiqueta: 'Original', icono: 'bi-image', ayuda: 'La foto tal cual, sin mejora' },
];

interface Props {
  modo: ModoMejora;
  onChange: (modo: ModoMejora) => void;
  deshabilitado?: boolean;
}

export function SelectorModo({ modo, onChange, deshabilitado }: Props) {
  return (
    <div className="escaner-modos" role="group" aria-label="Modo de mejora">
      {MODOS.map((m) => (
        <button
          key={m.modo}
          type="button"
          className={`btn escaner-boton-modo ${m.modo === modo ? 'btn-primary' : 'btn-outline-primary'}`}
          aria-pressed={m.modo === modo}
          aria-label={m.etiqueta}
          title={m.ayuda}
          disabled={deshabilitado}
          onClick={() => m.modo !== modo && onChange(m.modo)}
        >
          <i className={`bi ${m.icono} d-block fs-5`} aria-hidden="true" />
          <span className="small">{m.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
