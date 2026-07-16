'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Dropdown } from 'react-bootstrap';
import { notificacionesApi, NotificacionItem } from '@/lib/api/notificaciones';

const INTERVALO_REFRESCO_MS = 60_000;

function formatFechaVencimiento(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function mensajeDiasRestantes(dias: number) {
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Vence en 1 día';
  return `Vence en ${dias} días`;
}

export function NotificacionesBell() {
  const router = useRouter();
  const [notificaciones, setNotificaciones] = useState<NotificacionItem[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(false);

  const cargarContador = useCallback(async () => {
    try {
      const { count } = await notificacionesApi.contarNoLeidas();
      setNoLeidas(count);
    } catch {
      /* el contador se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    void cargarContador();
    const id = window.setInterval(() => void cargarContador(), INTERVALO_REFRESCO_MS);
    return () => window.clearInterval(id);
  }, [cargarContador]);

  const cargarLista = useCallback(async () => {
    try {
      setCargando(true);
      const data = await notificacionesApi.listar();
      setNotificaciones(data);
    } finally {
      setCargando(false);
    }
  }, []);

  const irAlCandidato = async (notificacion: NotificacionItem) => {
    if (!notificacion.leida) {
      await notificacionesApi.marcarLeida(notificacion._id);
      setNotificaciones((prev) =>
        prev.map((item) =>
          item._id === notificacion._id ? { ...item, leida: true } : item,
        ),
      );
      setNoLeidas((prev) => Math.max(0, prev - 1));
    }
    router.push(`/candidato/${notificacion.candidatoId}#cursos-y-certificaciones`);
  };

  const marcarTodasLeidas = async () => {
    await notificacionesApi.marcarTodasLeidas();
    setNotificaciones((prev) => prev.map((item) => ({ ...item, leida: true })));
    setNoLeidas(0);
  };

  return (
    <Dropdown
      align="end"
      onToggle={(abierto) => {
        if (abierto) void cargarLista();
      }}
    >
      <Dropdown.Toggle
        variant="link"
        id="campana-notificaciones"
        className="btn-campana-enmv"
      >
        <i className="bi bi-bell" aria-hidden="true" />
        {noLeidas > 0 && (
          <Badge bg="danger" pill className="badge-campana-enmv">
            {noLeidas > 99 ? '99+' : noLeidas}
          </Badge>
        )}
        <span className="visually-hidden">Notificaciones</span>
      </Dropdown.Toggle>

      <Dropdown.Menu className="panel-notificaciones-enmv">
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <span className="fw-semibold small">Notificaciones</span>
          {noLeidas > 0 && (
            <button
              type="button"
              className="btn btn-link btn-sm p-0"
              onClick={() => void marcarTodasLeidas()}
            >
              Marcar todas como leídas
            </button>
          )}
        </div>

        {cargando ? (
          <div className="text-center text-muted py-3 small">Cargando…</div>
        ) : notificaciones.length === 0 ? (
          <div className="text-center text-muted py-3 small">
            Sin notificaciones de vencimiento por ahora.
          </div>
        ) : (
          notificaciones.map((notificacion) => (
            <Dropdown.Item
              key={notificacion._id}
              onClick={() => void irAlCandidato(notificacion)}
              className={
                notificacion.leida ? undefined : 'notificacion-no-leida'
              }
            >
              <div className="fw-semibold small">
                {notificacion.nombreCandidato}
              </div>
              <div className="small">{notificacion.nombreCurso}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                Vence {formatFechaVencimiento(notificacion.fechaVencimiento)} ·{' '}
                {mensajeDiasRestantes(notificacion.diasRestantes)}
              </div>
            </Dropdown.Item>
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
