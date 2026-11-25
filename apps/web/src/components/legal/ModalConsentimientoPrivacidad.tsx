'use client';

import { useState } from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import api from '@/lib/api/client';
import { cerrarSesion } from '@/lib/auth/refrescarSesion';
import {
  AVISO_PRIVACIDAD_VERSION,
  RUTA_AVISO_PRIVACIDAD,
} from '@/lib/privacidad/avisoPrivacidad';
import { marcarConsentimientoPendiente } from '@/lib/privacidad/consentimientoPendiente';

/**
 * Modal bloqueante para cuentas que no han aceptado el aviso de privacidad
 * vigente (P-01). No se puede cerrar: solo aceptar o cerrar sesión. La API
 * también bloquea (403 PRIVACY_CONSENT_REQUIRED) mientras no se acepte.
 */
export default function ModalConsentimientoPrivacidad() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const aceptar = async () => {
    setEnviando(true);
    setError('');
    try {
      await api.post('/privacidad/consentimiento', { version: AVISO_PRIVACIDAD_VERSION });
      marcarConsentimientoPendiente(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 400
          ? 'El aviso de privacidad se actualizó. Recarga la página para ver la versión vigente.'
          : 'No pudimos registrar tu aceptación. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      show
      backdrop="static"
      keyboard={false}
      centered
      scrollable
      aria-labelledby="titulo-consentimiento-privacidad"
    >
      <Modal.Header style={{ borderBottom: '3px solid var(--asommmn-dorado)' }}>
        <Modal.Title id="titulo-consentimiento-privacidad" as="h2" className="h5 mb-0">
          <i className="bi bi-shield-check me-2" aria-hidden="true" />
          Aviso de privacidad
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: '0.9rem' }}>
        <p>
          Antes de continuar, lee y acepta el Aviso de Privacidad de ASOMMMN (versión{' '}
          {AVISO_PRIVACIDAD_VERSION}). En resumen:
        </p>
        <ul className="ps-3">
          <li>
            <strong>Responsable:</strong> ASOMMMN, con domicilio en Avenida Víctimas del 25 de Junio
            No. 176, Fraccionamiento Faros, C.P. 91709, Veracruz, Veracruz.
          </li>
          <li>
            <strong>Datos:</strong> identificación, contacto, trayectoria académica y laboral,
            certificaciones y cursos, documentos de identidad y de competencia marítima, y
            documentos de salud. Algunos son datos sensibles (salud, y fotografía y firma de los
            documentos de identidad) y se tratan con medidas reforzadas.
          </li>
          <li>
            <strong>Finalidad:</strong> integrar y evaluar tu expediente dentro del proceso de
            reclutamiento.
          </li>
          <li>
            Usamos la inteligencia artificial de OpenAI solo para extraer fechas y datos de tus
            documentos; las decisiones de evaluación las toman personas evaluadoras.
          </li>
          <li>
            Tus datos se alojan con proveedores de servicios en la nube que pueden estar fuera de
            México.
          </li>
          <li>
            Puedes ejercer tus derechos ARCO o revocar tu consentimiento escribiendo a{' '}
            <a href="mailto:asommmn@asommmn.org.mx">asommmn@asommmn.org.mx</a>.
          </li>
        </ul>
        <p className="mb-0">
          <a
            href={RUTA_AVISO_PRIVACIDAD}
            target="_blank"
            rel="noopener noreferrer"
            className="fw-semibold"
          >
            Leer el aviso de privacidad completo
            <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true" />
            <span className="visually-hidden"> (se abre en una pestaña nueva)</span>
          </a>
        </p>
        {error && (
          <Alert variant="danger" className="py-2 small mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <Button variant="link" className="text-muted px-0" onClick={cerrarSesion} disabled={enviando}>
          Cerrar sesión
        </Button>
        <Button className="btn-primary" onClick={aceptar} disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" className="me-2" />
              Guardando…
            </>
          ) : (
            'Aceptar y continuar'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
