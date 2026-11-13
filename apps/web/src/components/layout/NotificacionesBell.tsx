'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'react-bootstrap';
import {
  notificacionesApi,
  notificacionesAppApi,
  NotificacionAppItem,
  NotificacionItem,
} from '@/lib/api/notificaciones';
import {
  EstadoGrupos,
  INTERVALO_REFRESCO_MS,
  LIMITE_GRUPOS_CAMPANA,
  MENSAJES_CAMPANA,
  abrirAviso,
  marcarAvisoEnGrupos,
  marcarTodosEnGrupos,
  parametrosListado,
  type Pestana,
} from '@/lib/notificacionesCampana';
import { ContadorCampana, PanelNotificacionesVista } from './PanelNotificaciones';

/**
 * Campanita de evaluadores y admins. Junta dos fuentes:
 * - avisos de candidatos, agrupados por tipo y día, con lectura por
 *   usuario: /notificaciones/mias
 * - vencimientos de cursos (ya existían): /notificaciones
 * El historial completo está en /notificaciones.
 */
export function NotificacionesBell() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('todas');
  const [avisos, setAvisos] = useState<EstadoGrupos>({ grupos: [], noLeidas: 0 });
  const [vencimientos, setVencimientos] = useState<NotificacionItem[]>([]);
  const [noLeidasVenc, setNoLeidasVenc] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La pestaña vigente para los refrescos periódicos (sin recrear el intervalo).
  const pestanaRef = useRef<Pestana>('todas');

  const noLeidas = avisos.noLeidas + noLeidasVenc;

  /** Refresco silencioso (contadores y primeros grupos de la pestaña). */
  const refrescar = useCallback(async (p: Pestana = pestanaRef.current) => {
    const [a, v] = await Promise.allSettled([
      notificacionesAppApi.listarMias(
        parametrosListado({ pestana: p, limite: LIMITE_GRUPOS_CAMPANA }),
      ),
      notificacionesApi.contarNoLeidas(),
    ]);
    if (a.status === 'fulfilled' && p === pestanaRef.current) {
      setAvisos({ grupos: a.value.grupos ?? [], noLeidas: a.value.noLeidas });
    }
    if (v.status === 'fulfilled') setNoLeidasVenc(v.value.count);
    return a.status === 'fulfilled' && v.status === 'fulfilled';
  }, []);

  // Cada ~60 s, solo con la pestaña del navegador visible; al volver, refresca ya.
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

  /** Carga completa al abrir el panel o cambiar de pestaña. */
  const cargarPanel = useCallback(
    async (p: Pestana = pestanaRef.current) => {
      setCargando(true);
      setError(null);
      try {
        const [ok, lista] = await Promise.all([
          refrescar(p),
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
    },
    [refrescar],
  );

  const onToggle = (siguiente: boolean) => {
    setAbierto(siguiente);
    if (siguiente) void cargarPanel();
  };

  const cambiarPestana = (p: Pestana) => {
    pestanaRef.current = p;
    setPestana(p);
    setAvisos((prev) => ({ grupos: [], noLeidas: prev.noLeidas }));
    void cargarPanel(p);
  };

  const navegar = (href: string) => {
    setAbierto(false);
    router.push(href);
  };

  const marcarLeida = async (aviso: NotificacionAppItem) => {
    if (aviso.leida) return;
    setAvisos((prev) => marcarAvisoEnGrupos(prev, aviso._id));
    try {
      await notificacionesAppApi.marcarLeida(aviso._id);
    } catch {
      setError(MENSAJES_CAMPANA.errorMarcar);
      void refrescar().catch(() => undefined);
    }
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
      if (a.status === 'fulfilled') setAvisos(marcarTodosEnGrupos);
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
    <Dropdown align="end" show={abierto} onToggle={onToggle} autoClose="outside">
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
          grupos={avisos.grupos}
          vencimientos={vencimientos}
          noLeidas={noLeidas}
          pestana={pestana}
          cargando={cargando}
          error={error}
          marcandoTodas={marcandoTodas}
          onCambiarPestana={cambiarPestana}
          onRevisar={(aviso) =>
            void abrirAviso(aviso, {
              marcarLeida: notificacionesAppApi.marcarLeida,
              alMarcar: (id) => setAvisos((prev) => marcarAvisoEnGrupos(prev, id)),
              navegar,
            })
          }
          onMarcarLeida={(aviso) => void marcarLeida(aviso)}
          onAbrirVencimiento={(n) => void irAlVencimiento(n)}
          onMarcarTodas={() => void marcarTodas()}
          onReintentar={() => void cargarPanel()}
          onNavegar={navegar}
        />
      </Dropdown.Menu>
    </Dropdown>
  );
}
