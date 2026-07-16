'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row } from 'react-bootstrap';
import Swal from 'sweetalert2';
import api from '@/lib/api/client';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { BotonVolver } from '@/components/ui/BotonVolver';
import { TiempoTotalCard } from '@/components/bitacora-embarque/TiempoTotalCard';
import { EmbarqueTimeline } from '@/components/bitacora-embarque/EmbarqueTimeline';
import { EmbarqueModal } from '@/components/bitacora-embarque/EmbarqueModal';
import type {
  BitacoraEmbarqueResponse,
  EmbarqueFormValues,
  EmbarqueItem,
} from '@/components/bitacora-embarque/types';

function toErrorMessage(msg: unknown): string {
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  if (msg && typeof msg === 'object' && 'message' in msg)
    return toErrorMessage((msg as { message?: unknown }).message);
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return String(msg ?? 'Error inesperado');
}

export default function MiBitacoraEmbarquePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<BitacoraEmbarqueResponse | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [embarqueEditando, setEmbarqueEditando] = useState<EmbarqueItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const cargarEmbarques = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<BitacoraEmbarqueResponse>('/bitacora-embarque/mis-embarques');
      setData(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudo cargar la bitácora de embarque.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => { await cargarEmbarques(); };
    init();
  }, [cargarEmbarques]);

  const abrirModalAgregar = () => {
    setEmbarqueEditando(null);
    setFormError('');
    setShowModal(true);
  };

  const abrirModalEditar = (embarque: EmbarqueItem) => {
    setEmbarqueEditando(embarque);
    setFormError('');
    setShowModal(true);
  };

  const guardarEmbarque = async (valores: EmbarqueFormValues) => {
    const payload = {
      fechaEmbarco: valores.fechaEmbarco,
      fechaDesembarco: valores.fechaDesembarco,
      naviera: valores.naviera.trim(),
      nombreNave: valores.nombreNave.trim(),
      tipoMaquina: valores.tipoMaquina.trim(),
      potenciaKW: Number(valores.potenciaKW),
      tipoNave: valores.tipoNave.trim(),
      rango: valores.rango.trim(),
      bandera: valores.bandera.trim(),
    };

    try {
      setSaving(true);
      setFormError('');
      if (embarqueEditando) {
        await api.patch(`/bitacora-embarque/${embarqueEditando._id}`, payload);
      } else {
        await api.post('/bitacora-embarque', payload);
      }
      setShowModal(false);
      await cargarEmbarques();
      await Swal.fire({
        icon: 'success',
        title: embarqueEditando ? 'Embarque actualizado' : 'Embarque agregado',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      setFormError(toErrorMessage(axiosErr?.response?.data?.message ?? 'No se pudo guardar el embarque.'));
    } finally {
      setSaving(false);
    }
  };

  const eliminarEmbarque = async (embarque: EmbarqueItem) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar este embarque?',
      html: `Se eliminará permanentemente <strong>${embarque.nombreNave}</strong> de tu bitácora. No se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!conf.isConfirmed) return;

    try {
      await api.delete(`/bitacora-embarque/${embarque._id}`);
      await cargarEmbarques();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: unknown } } };
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: toErrorMessage(axiosErr?.response?.data?.message ?? 'Error al eliminar el embarque.'),
      });
    }
  };

  if (loading) {
    return (
      <div className="nautical-panel nautical-panel-postulante d-flex justify-content-center py-5">
        <SpinnerTimon size={44} />
      </div>
    );
  }

  return (
    <div className="py-4 nautical-panel nautical-panel-postulante" style={{ minHeight: '100vh' }}>
      <div className="container">
        <Row className="mb-3">
          <Col>
            <BotonVolver />
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Row className="mb-3">
          <Col>
            <h1 className="section-title">
              Bitácora de Embarque
              <span className="anchor-glyph">⚓</span>
            </h1>
            <p className="text-muted mb-0">
              Registra tu historial de embarques. Esta sección es opcional y no afecta tu expediente.
            </p>
          </Col>
        </Row>

        <Row className="mb-4">
          <Col lg={5}>
            <TiempoTotalCard tiempoTotal={data?.tiempoTotal ?? { anios: 0, meses: 0, totalDias: 0 }} />
          </Col>
        </Row>

        <Row className="mb-3">
          <Col className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 className="section-title mb-0" style={{ fontSize: '1.1rem' }}>
              Historial de embarques
            </h5>
            <Button
              style={{ background: 'var(--enmv-azul)', borderColor: 'var(--enmv-azul)' }}
              onClick={abrirModalAgregar}
            >
              + Agregar embarque
            </Button>
          </Col>
        </Row>

        <Row>
          <Col>
            <Card className="card-enmv card-enmv-top-dorado">
              <Card.Body>
                <EmbarqueTimeline
                  embarques={data?.embarques ?? []}
                  onEditar={abrirModalEditar}
                  onEliminar={(embarque) => void eliminarEmbarque(embarque)}
                />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      <EmbarqueModal
        key={showModal ? (embarqueEditando?._id ?? 'nuevo') : 'cerrado'}
        show={showModal}
        embarqueEditando={embarqueEditando}
        saving={saving}
        error={formError}
        onHide={() => setShowModal(false)}
        onSubmit={(valores) => void guardarEmbarque(valores)}
      />
    </div>
  );
}
