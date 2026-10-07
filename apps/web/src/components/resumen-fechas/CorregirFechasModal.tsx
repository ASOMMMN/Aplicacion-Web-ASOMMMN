'use client';

import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '@/lib/api/client';
import type { CampoFecha, PrecisionFecha, ResumenFechaItem } from './types';

const CAMPOS: CampoFecha[] = ['fechaEmision', 'fechaInicio', 'fechaVencimiento'];

/** Mensaje legible de un error de axios (message puede ser string o arreglo). */
export function mensajeError(err: unknown, porDefecto: string): string {
  let m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  // El filtro global de la API envuelve el cuerpo de la excepción: { message: { message, error } }.
  if (m && typeof m === 'object' && !Array.isArray(m)) m = (m as { message?: unknown }).message;
  if (Array.isArray(m)) return m.join('. ');
  return typeof m === 'string' && m ? m : porDefecto;
}

/**
 * Corrección manual de las fechas de un documento personal
 * (PATCH /docs-personales/:id/fechas). Solo se envían las fechas que
 * cambian: esas quedan bloqueadas y "Volver a analizar" ya no las sobrescribe.
 */
export function CorregirFechasModal({
  item,
  onCerrar,
  onGuardado,
}: {
  item: ResumenFechaItem;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [fechas, setFechas] = useState({
    fechaEmision: item.fechaEmision ?? '',
    fechaInicio: item.fechaInicio ?? '',
    fechaVencimiento: item.fechaVencimiento ?? '',
  });
  const precisionInicial = (c: CampoFecha): PrecisionFecha =>
    item.metaFechas?.[c]?.precision ?? item.precisionFechas?.[c] ?? 'dia';
  const [precisiones, setPrecisiones] = useState<Record<CampoFecha, PrecisionFecha>>({
    fechaEmision: precisionInicial('fechaEmision'),
    fechaInicio: precisionInicial('fechaInicio'),
    fechaVencimiento: precisionInicial('fechaVencimiento'),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (!item.docPersonal) return;
    const cambiados = CAMPOS.filter(
      (c) => fechas[c] !== (item[c] ?? '') || precisiones[c] !== precisionInicial(c),
    );
    if (cambiados.length === 0) {
      setError('No cambiaste ninguna fecha.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await api.patch(`/docs-personales/${item.docPersonal.id}/fechas`, {
        ...Object.fromEntries(cambiados.map((c) => [c, fechas[c] || null])),
        precisionFechas: Object.fromEntries(cambiados.filter((c) => fechas[c]).map((c) => [c, precisiones[c]])),
      });
      onGuardado();
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron guardar las fechas.'));
    } finally {
      setGuardando(false);
    }
  };

  const campo = (clave: keyof typeof fechas, etiqueta: string) => (
    <Form.Group className="mb-3" controlId={`corregir-${clave}`}>
      <Form.Label className="small mb-1">
        {etiqueta}
        {item.metaFechas?.[clave]?.bloqueada && (
          <i className="bi bi-lock-fill text-success ms-1" title="Ya corregida a mano" />
        )}
      </Form.Label>
      <div className="d-flex gap-2">
        <Form.Control
          type="date"
          size="sm"
          value={fechas[clave]}
          onChange={(e) => setFechas((f) => ({ ...f, [clave]: e.target.value }))}
        />
        <Form.Select
          size="sm"
          style={{ maxWidth: 130 }}
          aria-label={`Precisión de ${etiqueta.toLowerCase()}`}
          value={precisiones[clave]}
          disabled={!fechas[clave]}
          onChange={(e) => setPrecisiones((p) => ({ ...p, [clave]: e.target.value as PrecisionFecha }))}
        >
          <option value="dia">Día exacto</option>
          <option value="mes">Solo mes</option>
          <option value="anio">Solo año</option>
        </Form.Select>
      </div>
    </Form.Group>
  );

  return (
    <Modal show onHide={onCerrar} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h6">Corregir fechas · {item.nombre}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {item.docPersonal && item.docPersonal.motivosRevision.length > 0 && (
          <Alert variant="warning" className="small py-2">
            <strong>Motivos de revisión:</strong>
            <ul className="mb-0 ps-3">
              {item.docPersonal.motivosRevision.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Alert>
        )}
        {campo('fechaEmision', 'Fecha de emisión')}
        {campo('fechaInicio', 'Fecha de inicio (si el documento la indica)')}
        {campo('fechaVencimiento', 'Fecha de vencimiento')}
        <p className="small text-muted mb-0">
          Deja vacío lo que el documento no indique. Solo las fechas que cambies quedan bloqueadas: un nuevo
          análisis con IA no las cambiará (salvo con «Desbloquear y reanalizar»). Si el documento solo
          indica mes o año, elige la precisión.
        </p>
        {error && (
          <Alert variant="danger" className="small py-2 mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar fechas verificadas'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
