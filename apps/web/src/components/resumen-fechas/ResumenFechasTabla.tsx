'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Table } from 'react-bootstrap';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { formatearFechaCalendario, formatearFechaConPrecision } from '@/lib/fechas';
import { CorregirFechasModal, mensajeError } from './CorregirFechasModal';
import type {
  CampoFecha,
  ConfianzaIa,
  DocumentoDetectado,
  EstadoVigencia,
  FuenteFecha,
  FuenteFechaResumen,
  PrecisionFecha,
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
  no_aplica: { label: 'No aplica', plural: 'no vencen', className: 'bg-light text-secondary border', icon: 'bi-infinity' },
};

const ORIGENES: Record<OrigenResumen, { label: string; className: string }> = {
  cv: { label: 'Detectado en CV', className: 'badge-estado-proceso' },
  subido: { label: 'Subido por postulante', className: 'badge-estado-aprobado' },
  subido_y_cv: { label: 'Subido + en CV', className: 'badge-estado-aprobado' },
  // Neutro: el verde de "Subido" se confundiría con el badge "Vigente".
  doc_personal: { label: 'Documento personal', className: 'bg-primary-subtle text-primary-emphasis border' },
};

const formatearFecha = (iso: string) => formatearFechaCalendario(iso);

const FUENTES: Record<FuenteFecha, { label: string; title: string }> = {
  qr: { label: 'QR', title: 'Leída del código QR o de la cadena original del documento' },
  texto: { label: 'Etiqueta', title: 'Leída del texto del documento, junto a su etiqueta' },
  ocr: { label: 'OCR', title: 'Leída con reconocimiento de texto' },
  ia: { label: 'IA', title: 'Leída por la IA; ninguna otra fuente la confirma' },
};

/** Fuente de la fecha y su estado: Revisar (ámbar) tiene prioridad sobre Coincidente (verde). */
function BadgesFuente({ info }: { info?: FuenteFechaResumen }) {
  if (!info) return null;
  const fuente = FUENTES[info.fuente];
  return (
    <>
      <span className="badge bg-light text-secondary border ms-1" style={{ fontSize: '0.65rem' }} title={fuente.title}>
        {fuente.label}
      </span>
      {info.revisar ? (
        <span
          className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1"
          style={{ fontSize: '0.65rem' }}
          title="Las fuentes no coinciden o la fecha no pasó la validación; verifícala contra el documento"
        >
          Revisar
        </span>
      ) : (
        info.coincidente && (
          <span
            className="badge bg-success-subtle text-success-emphasis border border-success-subtle ms-1"
            style={{ fontSize: '0.65rem' }}
            title={info.fuente === 'qr' ? 'El QR del documento la confirma' : 'El texto del documento y la IA dicen lo mismo'}
          >
            Coincidente
          </span>
        )
      )}
    </>
  );
}

const NOMBRE_CAMPO: Record<CampoFecha, string> = {
  fechaEmision: 'emisión',
  fechaInicio: 'inicio',
  fechaVencimiento: 'vence',
};

/** Lista de los documentos encontrados en un mismo archivo. */
function DocumentosDetectados({ documentos }: { documentos: DocumentoDetectado[] }) {
  return (
    <ul className="list-unstyled mb-0 mt-1 small" style={{ fontSize: '0.75rem' }}>
      {documentos.map((d, i) => (
        <li key={i} className={d.principal ? 'fw-semibold' : 'text-muted'}>
          Documento {i + 1}
          {d.paginas.length > 0 && ` (pág. ${d.paginas.join(', ')})`}:{' '}
          {(Object.keys(NOMBRE_CAMPO) as CampoFecha[])
            .filter((c) => d.fechas[c])
            .map((c) => `${NOMBRE_CAMPO[c]} ${formatearFechaConPrecision(d.fechas[c]!.valor, d.fechas[c]!.precision)}`)
            .join(' · ') || 'sin fechas'}
          {d.principal && <span className="badge bg-primary-subtle text-primary-emphasis border ms-1">en uso</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Celda de fecha. Si falta y el dato viene solo del CV, lo dice explícitamente
 * ("No indicada en CV") para no confundirlo con un dato pendiente de capturar.
 */
function CeldaFecha({
  fecha,
  etiqueta,
  soloCV,
  confianza,
  precision = 'dia',
  fuente,
}: {
  fecha: string | null;
  etiqueta?: string;
  soloCV: boolean;
  confianza?: ConfianzaIa;
  precision?: PrecisionFecha;
  /** Documentos personales: fuente y estado de la fecha. */
  fuente?: FuenteFechaResumen;
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
      {formatearFechaConPrecision(fecha, precision)}
      {precision !== 'dia' && (
        <span
          className="badge bg-light text-secondary border ms-1"
          style={{ fontSize: '0.65rem' }}
          title={
            precision === 'anio'
              ? 'El documento solo indica el año'
              : 'El documento solo indica mes y año'
          }
        >
          {precision === 'anio' ? 'año' : 'mes'}
        </span>
      )}
      {etiqueta && <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>({etiqueta})</span>}
      <BadgesFuente info={fuente} />
      {confianza === 'baja' && (
        <i
          className="bi bi-question-circle text-warning ms-1"
          title="La IA tiene confianza baja en esta fecha; verifícala contra el documento"
        />
      )}
    </>
  );
}

/**
 * Documentos personales sin vencimiento: en lugar del "Sin fecha" genérico se
 * dice por qué (nunca analizado, no se encontraron fechas o el error).
 */
function badgeSinFechaDoc(item: ResumenFechaItem): { label: string; className: string; icon: string; title: string } | null {
  const doc = item.docPersonal;
  if (!doc || item.estadoVigencia !== 'sin_fecha') return null;
  switch (doc.extraccionEstado) {
    case 'pendiente':
      return {
        label: 'No analizado',
        className: 'bg-secondary',
        icon: 'bi-hourglass',
        title: 'Este documento nunca se analizó con IA. Usa "Volver a analizar".',
      };
    case 'sin_fechas':
      return {
        label: 'Sin fechas encontradas',
        className: 'bg-light text-secondary border',
        icon: 'bi-search',
        title: 'Se analizó y la IA no encontró fechas en el documento.',
      };
    case 'error':
      return {
        label: `Error: ${doc.extraccionError ?? 'desconocido'}`,
        className: 'bg-danger-subtle text-danger-emphasis border border-danger-subtle',
        icon: 'bi-exclamation-octagon',
        title: doc.extraccionError ?? 'Error desconocido',
      };
    case 'ok':
      return {
        label: 'Sin vencimiento encontrado',
        className: 'bg-light text-secondary border',
        icon: 'bi-calendar-x',
        title: 'Se encontraron otras fechas, pero no la de vencimiento.',
      };
  }
}

function tituloVigencia(item: ResumenFechaItem): string | undefined {
  if (item.estadoVigencia === 'no_aplica') return 'Este tipo de documento no vence';
  const dias = item.diasParaVencer;
  if (dias === null) return 'No se detectó fecha de vencimiento';
  if (dias < 0) return `Venció hace ${-dias} día(s)`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} día(s)`;
}

export function ResumenFechasTabla({
  postulanteId,
  recargarKey,
  tipos,
}: {
  postulanteId: string;
  /** Cambiarlo fuerza a recargar (p. ej. al confirmar una extracción). */
  recargarKey?: string;
  /** Filtra por tipo; por defecto muestra cursos y documentos personales. */
  tipos?: ResumenFechaItem['tipo'][];
}) {
  const [resumen, setResumen] = useState<ResumenFechasResponse | null>(null);
  const [error, setError] = useState('');
  /** Se incrementa tras una corrección o un análisis para recargar. */
  const [recarga, setRecarga] = useState(0);
  const [corrigiendo, setCorrigiendo] = useState<ResumenFechaItem | null>(null);
  const recargar = () => setRecarga((n) => n + 1);
  /** Documento que se está volviendo a analizar (uno a la vez). */
  const [analizando, setAnalizando] = useState<string | null>(null);
  const [avisoAccion, setAvisoAccion] = useState('');
  /** Documentos personales con la lista de documentos detectados abierta. */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setExpandidos((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  const volverAAnalizar = async (docId: string) => {
    setAnalizando(docId);
    setAvisoAccion('');
    try {
      const { data } = await api.post<{ aviso?: string }>(`/docs-personales/${docId}/reanalizar`);
      // Límite por minuto de OpenAI: el documento no cambió; se puede reintentar.
      if (data.aviso) setAvisoAccion(`${data.aviso}. Vuelve a intentarlo en un minuto.`);
    } catch (err) {
      setAvisoAccion(mensajeError(err, 'No se pudo volver a analizar el documento.'));
    } finally {
      setAnalizando(null);
      recargar();
    }
  };

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
  }, [postulanteId, recargarKey, recarga]);

  if (error) return <Alert variant="warning" className="mb-0 small">{error}</Alert>;
  if (!resumen) {
    return (
      <div className="d-flex justify-content-center py-3">
        <SpinnerTimon size={28} />
      </div>
    );
  }

  const items = tipos ? resumen.items.filter((i) => tipos.includes(i.tipo)) : resumen.items;
  if (items.length === 0) return <span className="text-muted small">—</span>;

  // El backend ya ordena (vencidos primero); aquí solo se cuenta lo visible.
  const conteo = items.reduce<Record<EstadoVigencia, number>>(
    (acc, i) => ({ ...acc, [i.estadoVigencia]: acc[i.estadoVigencia] + 1 }),
    { vencido: 0, por_vencer: 0, vigente: 0, sin_fecha: 0, no_aplica: 0 },
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
      {avisoAccion && (
        <Alert variant="danger" className="small py-2" dismissible onClose={() => setAvisoAccion('')}>
          {avisoAccion}
        </Alert>
      )}
      <div className="small text-muted mb-2 d-flex flex-wrap gap-2 align-items-center">
        {partesResumen.flatMap((p, idx) => (idx === 0 ? [p] : [<span key={`sep-${idx}`}>·</span>, p]))}
        <span className="ms-auto" style={{ fontSize: '0.75rem' }}>
          Por vencer = próximos {resumen.umbralPorVencerMeses} meses
        </span>
      </div>
      <Table size="sm" responsive hover className="mb-0">
        <thead>
          <tr>
            <th>Curso / documento</th>
            <th>Institución</th>
            <th>Inicio / emisión</th>
            <th>Fecha vence</th>
            <th>Vigencia</th>
            <th>Origen</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {items.map((c, idx) => {
            const estado = ESTADOS[c.estadoVigencia];
            const origen = ORIGENES[c.origen];
            const soloCV = c.origen === 'cv';
            const sinFechaDoc = badgeSinFechaDoc(c);
            const fuentes = c.docPersonal?.fuentesFechas;
            const documentos = c.docPersonal?.documentosDetectados ?? [];
            const abierto = c.docPersonal ? expandidos.has(c.docPersonal.id) : false;
            return (
              <tr key={`${c.nombre}-${idx}`}>
                <td title={c.nombreEnCV && c.nombreEnCV !== c.nombre ? `En el CV: ${c.nombreEnCV}` : undefined}>
                  {c.nombre}
                  {c.detalle && (
                    <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', maxWidth: 260 }} title={c.detalle}>
                      {c.detalle}
                    </div>
                  )}
                  {c.docPersonal?.revisarFechas && (
                    <span
                      className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                      title={c.docPersonal.motivosRevision.join(' · ')}
                    >
                      <i className="bi bi-flag-fill me-1" />
                      Revisar
                    </span>
                  )}
                  {c.docPersonal?.fechasVerificadas && (
                    <span
                      className="badge bg-success-subtle text-success-emphasis border border-success-subtle"
                      title="Fechas corregidas a mano por un evaluador"
                    >
                      <i className="bi bi-patch-check-fill me-1" />
                      Verificada
                    </span>
                  )}
                  {documentos.length > 1 && (
                    <div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-warning-emphasis"
                        style={{ fontSize: '0.75rem' }}
                        aria-expanded={abierto}
                        onClick={() => alternar(c.docPersonal!.id)}
                      >
                        <i className="bi bi-files me-1" />
                        {documentos.length} documentos en el archivo
                        <i className={`bi ${abierto ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1`} />
                      </Button>
                      {abierto && <DocumentosDetectados documentos={documentos} />}
                    </div>
                  )}
                </td>
                <td className="text-muted">{c.institucion ?? '—'}</td>
                <td className="text-muted small">
                  <CeldaFecha
                    fecha={c.fechaInicio ?? c.fechaEmision}
                    etiqueta={!c.fechaInicio && c.fechaEmision ? 'emisión' : undefined}
                    soloCV={soloCV}
                    confianza={c.fechaInicio ? c.confianzaCV?.fechaInicio : c.confianzaCV?.fechaEmision}
                    precision={c.fechaInicio ? c.precisionFechas?.fechaInicio : c.precisionFechas?.fechaEmision}
                    fuente={c.fechaInicio ? fuentes?.fechaInicio : fuentes?.fechaEmision}
                  />
                </td>
                <td className="text-muted small">
                  <CeldaFecha
                    fecha={c.fechaVencimiento}
                    soloCV={soloCV}
                    confianza={c.confianzaCV?.fechaVencimiento}
                    precision={c.precisionFechas?.fechaVencimiento}
                    fuente={fuentes?.fechaVencimiento}
                  />
                  {c.fechaVencimiento && c.fechaVencimientoEstimada && (
                    <span
                      className="badge bg-light text-secondary border ms-1"
                      title="No viene de un documento: el sistema la calculaba como inicio + 5 años. Verifícala contra el certificado."
                    >
                      Estimada
                    </span>
                  )}
                </td>
                <td>
                  {sinFechaDoc ? (
                    <span
                      className={`badge text-wrap text-start ${sinFechaDoc.className}`}
                      style={{ maxWidth: 240 }}
                      title={sinFechaDoc.title}
                    >
                      <i className={`bi ${sinFechaDoc.icon} me-1`} />
                      {sinFechaDoc.label}
                    </span>
                  ) : (
                    <span className={`badge ${estado.className}`} title={tituloVigencia(c)}>
                      <i className={`bi ${estado.icon} me-1`} />
                      {estado.label}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge-pill-enmv ${origen.className}`}>{origen.label}</span>
                  {c.discrepancia && (
                    <span
                      className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle ms-1"
                      title={`Vencimiento en documento subido: ${formatearFecha(c.discrepancia.fechaVencimientoSubido)} · en CV: ${formatearFecha(c.discrepancia.fechaVencimientoCV)}. Se usa el del documento subido.`}
                    >
                      <i className="bi bi-exclamation-diamond me-1" />
                      Discrepancia
                    </span>
                  )}
                </td>
                <td className="text-nowrap">
                  {c.docPersonal && (
                    <div className="d-flex flex-column align-items-start gap-1">
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0"
                        disabled={analizando !== null}
                        title={
                          c.docPersonal.fechasVerificadas
                            ? 'Vuelve a leer el documento con IA; las fechas verificadas no se cambian'
                            : 'Vuelve a leer el documento con IA y actualiza sus fechas'
                        }
                        onClick={() => volverAAnalizar(c.docPersonal!.id)}
                      >
                        <i className="bi bi-arrow-repeat" />{' '}
                        {analizando === c.docPersonal.id ? 'Analizando…' : 'Volver a analizar'}
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0"
                        title="Corregir las fechas a mano (quedan verificadas)"
                        onClick={() => setCorrigiendo(c)}
                      >
                        <i className="bi bi-pencil-square" /> Corregir
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {corrigiendo && (
        <CorregirFechasModal
          item={corrigiendo}
          onCerrar={() => setCorrigiendo(null)}
          onGuardado={() => {
            setCorrigiendo(null);
            recargar();
          }}
        />
      )}
    </>
  );
}
