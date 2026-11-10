'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'react-bootstrap';
import {
  notificacionesApi,
  notificacionesAppApi,
  NotificacionItem,
} from '@/lib/api/notificaciones';
import {
  EstadoAvisos,
  INTERVALO_REFRESCO_MS,
  LIMITE_AVISOS_CAMPANA,
  MENSAJES_CAMPANA,
  abrirAviso,
  marcarAvisoLeido,
  marcarTodosAvisosLeidos,
} from '@/lib/notificacionesCampana';
import { ContadorCampana, PanelNotificacionesVista } from './PanelNotificaciones';

/**
 * Campanita de evaluadores y admins. Junta dos fuentes:
 * - avisos de candidatos (nuevo registro / expediente completo), con
 *   lectura por usuario: /notificaciones/mias
 * - vencimientos de cursos (ya existían): /notificaciones
 */
export function NotificacionesBell() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState<EstadoAvisos>({ items: [], noLeidas: 0 });
  const [vencimientos, setVencimientos] = useState<NotificacionItem[]>([]);
  const [noLeidasVenc, setNoLeidasVenc] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noLeidas = avisos.noLeidas + noLeidasVenc;

  /** Refresco silencioso (contadores y primera página de avisos). */
  const refrescar = useCallback(async () => {
    const [a, v] = await Promise.allSettled([
      notificacionesAppApi.listarMias({ limite: LIMITE_AVISOS_CAMPANA }),
      notificacionesApi.contarNoLeidas(),
    ]);
    if (a.status === 'fulfilled') {
      setAvisos({ items: a.value.items, noLeidas: a.value.noLeidas });
    }
    if (v.status === 'fulfilled') setNoLeidasVenc(v.value.count);
    return a.status === 'fulfilled' && v.status === 'fulfilled';
  }, []);

  // Cada ~60 s, solo con la pestaña visible; al volver a ella, refresca ya.
  useEffect(() => {
    let cancelado = false;
    const tick = () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      void refrescar().catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, INTERVALO_REFRESCO_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelado = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refrescar]);

  /** Carga completa al abrir el panel, con estados de carga y error. */
  const cargarPanel = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ok, lista] = await Promise.all([
        refrescar(),
        notificacionesApi.listar().then(
          (data) => data,
          () => null,
        ),
      ]);
      if (lista) setVencimientos(lista);
      if (!ok || !lista) setError(MENSAJES_CAMPANA.errorCarga);
    } finally {
      setCargando(false);
    }
  }, [refrescar]);

  const onToggle = (siguiente: boolean) => {
    setAbierto(siguiente);
    if (siguiente) void cargarPanel();
  };

  const navegar = (href: string) => {
    setAbierto(false);
    router.push(href);
  };

  const irAlVencimiento = async (n: NotificacionItem) => {
    if (!n.leida) {
      setVencimientos((prev) =>
        prev.map((item) => (item._id === n._id ? { ...item, leida: true } : item)),
      );
      setNoLeidasVenc((prev) => Math.max(0, prev - 1));
      try {
        await notificacionesApi.marcarLeida(n._id);
      } catch {
        /* se corrige en el siguiente refresco */
      }
    }
    navegar(`/candidato/${encodeURIComponent(n.candidatoId)}#cursos-y-certificaciones`);
  };

  const marcarTodas = async () => {
    setMarcandoTodas(true);
    setError(null);
    try {
      const [a, v] = await Promise.allSettled([
        avisos.noLeidas > 0 ? notificacionesAppApi.marcarTodasLeidas() : Promise.resolve(null),
        noLeidasVenc > 0 ? notificacionesApi.marcarTodasLeidas() : Promise.resolve(null),
      ]);
      if (a.status === 'fulfilled') setAvisos(marcarTodosAvisosLeidos);
      if (v.status === 'fulfilled') {
        setVencimientos((prev) => prev.map((item) => ({ ...item, leida: true })));
        setNoLeidasVenc(0);
      }
      if (a.status === 'rejected' || v.status === 'rejected') {
        setError(MENSAJES_CAMPANA.errorMarcarTodas);
      }
    } finally {
      setMarcandoTodas(false);
    }
  };

  return (
    <Dropdown align="end" show={abierto} onToggle={onToggle}>
      <Dropdown.Toggle
        variant="link"
        id="campana-notificaciones"
        className="btn-campana-asommmn"
        aria-label={
          noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'
        }
      >
        <i className="bi bi-bell" aria-hidden="true" />
        <ContadorCampana noLeidas={noLeidas} />
      </Dropdown.Toggle>

      <Dropdown.Menu className="panel-notificaciones-asommmn">
        <PanelNotificacionesVista
          avisos={avisos.items}
          vencimientos={vencimientos}
          noLeidas={noLeidas}
          cargando={cargando}
          error={error}
          marcandoTodas={marcandoTodas}
          onAbrirAviso={(aviso) =>
            void abrirAviso(aviso, {
              marcarLeida: notificacionesAppApi.marcarLeida,
              alMarcar: (id) => setAvisos((prev) => marcarAvisoLeido(prev, id)),
              navegar,
            })
          }
          onAbrirVencimiento={(n) => void irAlVencimiento(n)}
          onMarcarTodas={() => void marcarTodas()}
          onReintentar={() => void cargarPanel()}
        />
      </Dropdown.Menu>
    </Dropdown>
  );
}
