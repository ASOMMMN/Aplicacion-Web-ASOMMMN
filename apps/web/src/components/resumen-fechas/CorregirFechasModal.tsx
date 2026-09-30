'use client';

import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '@/lib/api/client';
import type { ResumenFechaItem } from './types';

/** Mensaje legible de un error de axios (message puede ser string o arreglo). */
export function mensajeError(err: unknown, porDefecto: string): string {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(m)) return m.join('. ');
  return typeof m === 'string' && m ? m : porDefecto;
}

/**
 * Corrección manual de las fechas de un documento personal
 * (PATCH /docs-personales/:id/fechas). Las fechas quedan verificadas y
 * "Volver a analizar" ya no las sobrescribe.
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (!item.docPersonal) return;
    setGuardando(true);
    setError('');
    try {
      await api.patch(`/docs-personales/${item.docPersonal.id}/fechas`, {
        fechaEmision: fechas.fechaEmision || null,
        fechaInicio: fechas.fechaInicio || null,
        fechaVencimiento: fechas.fechaVencimiento || null,
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
      <Form.Label className="small mb-1">{etiqueta}</Form.Label>
      <Form.Control
        type="date"
        size="sm"
        value={fechas[clave]}
        onChange={(e) => setFechas((f) => ({ ...f, [clave]: e.target.value }))}
      />
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
          Deja vacío lo que el documento no indique. Las fechas quedarán como verificadas y un nuevo
          análisis con IA no las cambiará.
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
