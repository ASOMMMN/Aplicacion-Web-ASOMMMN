'use client';

import { useEffect, useState } from 'react';
import { Alert, Table } from 'react-bootstrap';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import type {
  ConfianzaIa,
  EstadoVigencia,
  OrigenResumen,
  ResumenFechaItem,
  ResumenFechasResponse,
} from './types';

const ESTADOS: Record<
  EstadoVigencia,
  { label: string; plural: string; className: string; icon: string }
> = {
  vencido: { label: 'Vencido', plural: 'vencidos', className: 'bg-danger', icon: 'bi-x-circle-fill' },
  por_vencer: { label: 'Por vencer', plural: 'por vencer', className: 'bg-warning text-dark', icon: 'bi-exclamation-triangle-fill' },
  vigente: { label: 'Vigente', plural: 'vigentes', className: 'bg-success', icon: 'bi-check-circle-fill' },
  sin_fecha: { label: 'Sin fecha', plural: 'sin fecha', className: 'bg-secondary', icon: 'bi-dash-circle' },
};

const ORIGENES: Record<OrigenResumen, { label: string; className: string }> = {
  cv: { label: 'Detectado en CV', className: 'badge-estado-proceso' },
  subido: { label: 'Subido por postulante', className: 'badge-estado-aprobado' },
  subido_y_cv: { label: 'Subido + en CV', className: 'badge-estado-aprobado' },
  doc_personal: { label: 'Documento personal', className: 'badge-estado-aprobado' },
};

/** YYYY-MM-DD → DD/MM/YYYY sin pasar por Date (evita el desfase de zona horaria). */
const formatearFecha = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Celda de fecha. Si falta y el dato viene solo del CV, lo dice explícitamente
 * ("No indicada en CV") para no confundirlo con un dato pendiente de capturar.
 */
function CeldaFecha({
  fecha,
  etiqueta,
  soloCV,
  confianza,
}: {
  fecha: string | null;
  etiqueta?: string;
  soloCV: boolean;
  confianza?: ConfianzaIa;
}) {
  if (!fecha) {
    return soloCV ? (
      <span className="text-secondary fst-italic" style={{ fontSize: '0.8rem' }}>
        No indicada en CV
      </span>
    ) : (
      <>—</>
    );
  }
  return (
    <>
      {formatearFecha(fecha)}
      {etiqueta && <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>({etiqueta})</span>}
      {confianza === 'baja' && (
        <i
          className="bi bi-question-circle text-warning ms-1"
          title="La IA tiene confianza baja en esta fecha; verifícala contra el documento"
        />
      )}
    </>
  );
}

function tituloVigencia(item: ResumenFechaItem): string | undefined {
  const dias = item.diasParaVencer;
  if (dias === null) return 'No se detectó fecha de vencimiento';
  if (dias < 0) return `Venció hace ${-dias} día(s)`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} día(s)`;
}

export function ResumenFechasTabla({
  postulanteId,
  recargarKey,
  tipos = ['Curso'],
}: {
  postulanteId: string;
  /** Cambiarlo fuerza a recargar (p. ej. al confirmar una extracción). */
  recargarKey?: string;
  tipos?: ResumenFechaItem['tipo'][];
}) {
  const [resumen, setResumen] = useState<ResumenFechasResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    api
      .get<ResumenFechasResponse>(`/resumen-fechas/postulante/${postulanteId}`)
      .then((res) => {
        if (!cancelado) {
          setResumen(res.data);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo cargar el resumen de fechas.');
      });
    return () => {
      cancelado = true;
    };
  }, [postulanteId, recargarKey]);

  if (error) return <Alert variant="warning" className="mb-0 small">{error}</Alert>;
  if (!resumen) {
    return (
      <div className="d-flex justify-content-center py-3">
        <SpinnerTimon size={28} />
      </div>
    );
  }

  const items = resumen.items.filter((i) => tipos.includes(i.tipo));
  if (items.length === 0) return <span className="text-muted small">—</span>;

  // El backend ya ordena (vencidos primero); aquí solo se cuenta lo visible.
  const conteo = items.reduce<Record<EstadoVigencia, number>>(
    (acc, i) => ({ ...acc, [i.estadoVigencia]: acc[i.estadoVigencia] + 1 }),
    { vencido: 0, por_vencer: 0, vigente: 0, sin_fecha: 0 },
  );
  const partesResumen = (Object.keys(ESTADOS) as EstadoVigencia[])
    .filter((e) => conteo[e] > 0)
    .map((e) => (
      <span key={e} className={e === 'vencido' ? 'text-danger fw-semibold' : undefined}>
        {conteo[e]} {ESTADOS[e].plural}
      </span>
    ));

  return (
    <>
      <div className="small text-muted mb-2 d-flex flex-wrap gap-2 align-items-center">
        {partesResumen.flatMap((p, idx) => (idx === 0 ? [p] : [<span key={`sep-${idx}`}>·</span>, p]))}
        <span className="ms-auto" style={{ fontSize: '0.75rem' }}>
          Por vencer = próximos {resumen.umbralPorVencerMeses} meses
        </span>
      </div>
      <Table size="sm" responsive hover className="mb-0">
        <thead>
          <tr>
            <th>Curso</th>
            <th>Institución</th>
            <th>Inicio / emisión</th>
            <th>Fecha vence</th>
            <th>Vigencia</th>
            <th>Origen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, idx) => {
            const estado = ESTADOS[c.estadoVigencia];
            const origen = ORIGENES[c.origen];
            const soloCV = c.origen === 'cv';
            return (
              <tr key={`${c.nombre}-${idx}`}>
                <td>{c.nombre}</td>
                <td className="text-muted">{c.institucion ?? '—'}</td>
                <td className="text-muted small">
                  <CeldaFecha
                    fecha={c.fechaInicio ?? c.fechaEmision}
                    etiqueta={!c.fechaInicio && c.fechaEmision ? 'emisión' : undefined}
                    soloCV={soloCV}
                    confianza={c.fechaInicio ? c.confianzaCV?.fechaInicio : c.confianzaCV?.fechaEmision}
                  />
                </td>
                <td className="text-muted small">
                  <CeldaFecha
                    fecha={c.fechaVencimiento}
                    soloCV={soloCV}
                    confianza={c.confianzaCV?.fechaVencimiento}
                  />
                </td>
                <td>
                  <span className={`badge ${estado.className}`} title={tituloVigencia(c)}>
                    <i className={`bi ${estado.icon} me-1`} />
                    {estado.label}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-pill-enmv ${origen.className}`}>{origen.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
