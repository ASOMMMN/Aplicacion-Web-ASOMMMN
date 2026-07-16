import { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import {
  EMBARQUE_FORM_VACIO,
  TIPOS_NAVE_COMUNES,
  type EmbarqueFormValues,
  type EmbarqueItem,
} from './types';

interface EmbarqueModalProps {
  show: boolean;
  embarqueEditando: EmbarqueItem | null;
  saving: boolean;
  error: string;
  onHide: () => void;
  onSubmit: (valores: EmbarqueFormValues) => void;
}

function embarqueAFormulario(embarque: EmbarqueItem): EmbarqueFormValues {
  const esComun = (TIPOS_NAVE_COMUNES as readonly string[]).includes(embarque.tipoNave);
  return {
    fechaEmbarco: embarque.fechaEmbarco.slice(0, 10),
    fechaDesembarco: embarque.fechaDesembarco.slice(0, 10),
    naviera: embarque.naviera,
    nombreNave: embarque.nombreNave,
    tipoMaquina: embarque.tipoMaquina,
    potenciaKW: String(embarque.potenciaKW),
    tipoNave: esComun ? embarque.tipoNave : 'Otro',
    tipoNaveOtro: esComun ? '' : embarque.tipoNave,
    rango: embarque.rango,
    bandera: embarque.bandera,
  };
}

export function EmbarqueModal({
  show,
  embarqueEditando,
  saving,
  error,
  onHide,
  onSubmit,
}: EmbarqueModalProps) {
  const [valores, setValores] = useState<EmbarqueFormValues>(() =>
    embarqueEditando ? embarqueAFormulario(embarqueEditando) : EMBARQUE_FORM_VACIO,
  );

  const set = <K extends keyof EmbarqueFormValues>(campo: K, valor: EmbarqueFormValues[K]) =>
    setValores((v) => ({ ...v, [campo]: valor }));

  const tipoNaveFinal =
    valores.tipoNave === 'Otro' ? valores.tipoNaveOtro.trim() : valores.tipoNave;

  const esValido =
    valores.fechaEmbarco.trim() !== '' &&
    valores.fechaDesembarco.trim() !== '' &&
    valores.naviera.trim() !== '' &&
    valores.nombreNave.trim() !== '' &&
    valores.tipoMaquina.trim() !== '' &&
    valores.potenciaKW.trim() !== '' &&
    !Number.isNaN(Number(valores.potenciaKW)) &&
    Number(valores.potenciaKW) >= 0 &&
    tipoNaveFinal !== '' &&
    valores.rango.trim() !== '' &&
    valores.bandera.trim() !== '' &&
    valores.fechaDesembarco >= valores.fechaEmbarco;

  const handleGuardar = () => {
    if (!esValido) return;
    onSubmit({ ...valores, tipoNave: tipoNaveFinal });
  };

  return (
    <Modal show={show} onHide={onHide} centered className="enmv-modal" size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {embarqueEditando ? 'Editar embarque' : 'Agregar embarque'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        <div className="row g-3">
          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Fecha de embarco <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              size="sm"
              value={valores.fechaEmbarco}
              onChange={(e) => set('fechaEmbarco', e.target.value)}
            />
          </div>
          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Fecha de desembarco <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              size="sm"
              value={valores.fechaDesembarco}
              onChange={(e) => set('fechaDesembarco', e.target.value)}
              isInvalid={
                valores.fechaDesembarco !== '' &&
                valores.fechaEmbarco !== '' &&
                valores.fechaDesembarco < valores.fechaEmbarco
              }
            />
            <Form.Control.Feedback type="invalid">
              No puede ser anterior a la fecha de embarco.
            </Form.Control.Feedback>
          </div>

          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Compañía naviera <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              maxLength={150}
              value={valores.naviera}
              onChange={(e) => set('naviera', e.target.value)}
            />
          </div>
          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Nombre de la nave <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              maxLength={150}
              value={valores.nombreNave}
              onChange={(e) => set('nombreNave', e.target.value)}
            />
          </div>

          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Tipo de máquina (motor) <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              maxLength={100}
              value={valores.tipoMaquina}
              onChange={(e) => set('tipoMaquina', e.target.value)}
            />
          </div>
          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Potencia del motor principal (KW) <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              min={0}
              size="sm"
              value={valores.potenciaKW}
              onChange={(e) => set('potenciaKW', e.target.value)}
            />
          </div>

          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Tipo de nave <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              size="sm"
              value={valores.tipoNave}
              onChange={(e) => set('tipoNave', e.target.value)}
            >
              <option value="" disabled>Selecciona una opción</option>
              {TIPOS_NAVE_COMUNES.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </Form.Select>
          </div>
          {valores.tipoNave === 'Otro' && (
            <div className="col-sm-6">
              <Form.Label className="small fw-semibold">
                Especifica el tipo de nave <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                size="sm"
                maxLength={100}
                value={valores.tipoNaveOtro}
                onChange={(e) => set('tipoNaveOtro', e.target.value)}
              />
            </div>
          )}

          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Rango ocupado a bordo <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              maxLength={100}
              value={valores.rango}
              onChange={(e) => set('rango', e.target.value)}
            />
          </div>
          <div className="col-sm-6">
            <Form.Label className="small fw-semibold">
              Bandera del barco (país) <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              maxLength={80}
              value={valores.bandera}
              onChange={(e) => set('bandera', e.target.value)}
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={saving}>
          Cancelar
        </Button>
        <Button
          style={{ background: 'var(--enmv-azul)', borderColor: 'var(--enmv-azul)' }}
          onClick={handleGuardar}
          disabled={!esValido || saving}
        >
          {saving ? <><SpinnerTimon size={14} className="me-1" />Guardando…</> : 'Guardar embarque'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
