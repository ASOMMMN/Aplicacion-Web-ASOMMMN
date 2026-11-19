'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Cuadrilatero, Punto } from '@/lib/scanner/tipos';

const NOMBRES = [
  'Esquina superior izquierda',
  'Esquina superior derecha',
  'Esquina inferior derecha',
  'Esquina inferior izquierda',
];

const LADO_LUPA = 120;
const ZOOM_LUPA = 2.5;

interface Props {
  /** URL blob: de la foto (ya reducida). */
  url: string;
  /** Tamaño en píxeles de la foto; las esquinas están en esas coordenadas. */
  ancho: number;
  alto: number;
  esquinas: Cuadrilatero;
  onChange: (esquinas: Cuadrilatero) => void;
}

/**
 * Foto con los 4 puntos del documento arrastrables (dedo, ratón o
 * flechas del teclado). Mientras se arrastra, una lupa muestra la zona
 * ampliada para colocar la esquina con precisión.
 */
export function EditorEsquinas({ url, ancho, alto, esquinas, onChange }: Props) {
  const marco = useRef<HTMLDivElement>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [lupa, setLupa] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const lado = Math.max(ancho, alto);
  const radio = lado * 0.022;
  const radioToque = lado * 0.06;

  const aImagen = (clientX: number, clientY: number): Punto | null => {
    const r = marco.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return {
      x: Math.max(0, Math.min(ancho, ((clientX - r.left) / r.width) * ancho)),
      y: Math.max(0, Math.min(alto, ((clientY - r.top) / r.height) * alto)),
    };
  };

  const mover = (i: number, p: Punto) => {
    const nuevas = esquinas.map((q, j) => (j === i ? p : q)) as Cuadrilatero;
    onChange(nuevas);
    const r = marco.current?.getBoundingClientRect();
    if (r) setLupa({ x: (p.x / ancho) * r.width, y: (p.y / alto) * r.height, w: r.width, h: r.height });
  };

  const alPresionar = (i: number) => (e: PointerEvent<SVGCircleElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastrando(i);
    const p = aImagen(e.clientX, e.clientY);
    if (p) mover(i, p);
  };

  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    if (arrastrando === null) return;
    const p = aImagen(e.clientX, e.clientY);
    if (p) mover(arrastrando, p);
  };

  const alSoltar = () => {
    setArrastrando(null);
    setLupa(null);
  };

  const alTeclear = (i: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const paso = (e.shiftKey ? 0.05 : 0.01) * lado;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0],
      ArrowRight: [paso, 0],
      ArrowUp: [0, -paso],
      ArrowDown: [0, paso],
    };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    const q = esquinas[i];
    onChange(
      esquinas.map((p, j) =>
        j === i
          ? { x: Math.max(0, Math.min(ancho, q.x + delta[0])), y: Math.max(0, Math.min(alto, q.y + delta[1])) }
          : p,
      ) as Cuadrilatero,
    );
  };

  const puntos = esquinas.map((p) => `${p.x},${p.y}`).join(' ');
  // La lupa se muestra del lado contrario al dedo para no taparla.
  const lupaIzquierda = lupa ? lupa.x > lupa.w / 2 : true;

  return (
    <div className="escaner-lienzo">
      <div ref={marco} className="escaner-marco">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, no aplica next/image */}
        <img src={url} alt="Foto del documento" className="escaner-foto" draggable={false} />
        <svg
          className="escaner-esquinas"
          viewBox={`0 0 ${ancho} ${alto}`}
          preserveAspectRatio="none"
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <path
            d={`M0 0H${ancho}V${alto}H0Z M${puntos.replace(/ /g, ' L')}Z`}
            fillRule="evenodd"
            className="escaner-sombra"
          />
          <polygon points={puntos} className="escaner-contorno" strokeWidth={lado * 0.004} />
          {esquinas.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={radio} className="escaner-punto" strokeWidth={lado * 0.005} />
              <circle
                cx={p.x}
                cy={p.y}
                r={radioToque}
                className="escaner-punto-toque"
                tabIndex={0}
                role="slider"
                aria-label={`${NOMBRES[i]}. Usa las flechas para moverla.`}
                aria-valuetext={`${Math.round((p.x / ancho) * 100)}% horizontal, ${Math.round((p.y / alto) * 100)}% vertical`}
                onPointerDown={alPresionar(i)}
                onKeyDown={alTeclear(i)}
              />
            </g>
          ))}
        </svg>
        {lupa && (
          <div
            className="escaner-lupa"
            aria-hidden="true"
            style={{
              width: LADO_LUPA,
              height: LADO_LUPA,
              [lupaIzquierda ? 'left' : 'right']: 8,
              backgroundImage: `url(${url})`,
              backgroundSize: `${lupa.w * ZOOM_LUPA}px ${lupa.h * ZOOM_LUPA}px`,
              backgroundPosition: `${LADO_LUPA / 2 - lupa.x * ZOOM_LUPA}px ${LADO_LUPA / 2 - lupa.y * ZOOM_LUPA}px`,
            }}
          />
        )}
      </div>
    </div>
  );
}
