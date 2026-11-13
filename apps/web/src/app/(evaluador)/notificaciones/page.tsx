'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  notificacionesAppApi,
  type GrupoNotificacionesApp,
  type NotificacionAppItem,
  type TipoNotificacionApp,
} from '@/lib/api/notificaciones';
import {
  LIMITE_DETALLE_PAGINA,
  LIMITE_GRUPOS_PAGINA,
  MENSAJES_CAMPANA,
  abrirAviso,
  filtroDesdeUrl,
  marcarAvisoEnGrupos,
  marcarGrupoLeido,
  marcarTodosEnGrupos,
  parametrosListado,
  totalPaginas as calcularTotalPaginas,
  type EstadoGrupos,
  type Pestana,
} from '@/lib/notificacionesCampana';
import { HistorialNotificacionesVista } from '@/components/layout/HistorialNotificacionesVista';

type Filtro = { tipo?: TipoNotificacionApp; dia?: string };

/**
 * /notificaciones: historial de avisos de candidatos, paginado y agrupado
 * por día. Evaluador y administrador (el layout y proxy.ts lo restringen; la
 * API responde 403 a cualquier otro rol).
 */
function Historial({ filtro }: { filtro: Filtro }) {
  const router = useRouter();
  const detalle = Boolean(filtro.tipo || filtro.dia);
  const limite = detalle ? LIMITE_DETALLE_PAGINA : LIMITE_GRUPOS_PAGINA;

  const [pestana, setPestana] = useState<Pestana>('todas');
  const [pagina, setPagina] = useState(1);
  // Sube para volver a pedir la misma página (Reintentar, tras marcar un grupo).
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState<EstadoGrupos>({ grupos: [], noLeidas: 0 });
  const [items, setItems] = useState<NotificacionAppItem[]>([]);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tipo, dia } = filtro;
  useEffect(() => {
    let vigente = true;
    notificacionesAppApi
      .listarMias(parametrosListado({ pestana, pagina, limite, tipo, dia }))
      .then(
        (r) => {
          if (!vigente) return;
          setEstado({ grupos: r.grupos ?? [], noLeidas: r.noLeidas });
          setItems(r.items);
          setTotalPaginas(
            calcularTotalPaginas(detalle ? r.total : (r.totalGrupos ?? 0), limite),
          );
          setError(null);
        },
        () => {
          if (vigente) setError(MENSAJES_CAMPANA.errorCarga);
        },
      )
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [pestana, pagina, limite, tipo, dia, detalle, version]);

  const recargar = () => {
    setCargando(true);
    setError(null);
    setVersion((v) => v + 1);
  };

  const cambiarPestana = (p: Pestana) => {
    setCargando(true);
    setPestana(p);
    setPagina(1);
  };

  const irAPagina = (p: number) => {
    setCargando(true);
    setPagina(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const marcarLocal = (id: string) => {
    if (!detalle) {
      setEstado((prev) => marcarAvisoEnGrupos(prev, id));
      return;
    }
    const objetivo = items.find((n) => n._id === id);
    if (!objetivo || objetivo.leida) return;
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, leida: true } : n)));
    setEstado((e) => ({ ...e, noLeidas: Math.max(0, e.noLeidas - 1) }));
  };

  const marcarLeida = async (aviso: NotificacionAppItem) => {
    if (aviso.leida) return;
    marcarLocal(aviso._id);
    try {
      await notificacionesAppApi.marcarLeida(aviso._id);
    } catch {
      recargar();
      setError(MENSAJES_CAMPANA.errorMarcar);
    }
  };

  const marcarGrupo = async (grupo: GrupoNotificacionesApp) => {
    setEstado((prev) => marcarGrupoLeido(prev, grupo.clave));
    try {
      await notificacionesAppApi.marcarTodasLeidas({ tipo: grupo.tipo, dia: grupo.dia });
      // El grupo puede tener más avisos de los visibles: se vuelve a pedir.
      recargar();
    } catch {
      recargar();
      setError(MENSAJES_CAMPANA.errorMarcarTodas);
    }
  };

  const marcarTodas = async () => {
    setMarcandoTodas(true);
    setError(null);
    try {
      await notificacionesAppApi.marcarTodasLeidas();
      setEstado(marcarTodosEnGrupos);
      setItems((prev) => prev.map((n) => (n.leida ? n : { ...n, leida: true })));
    } catch {
      setError(MENSAJES_CAMPANA.errorMarcarTodas);
    } finally {
      setMarcandoTodas(false);
    }
  };

  return (
    <HistorialNotificacionesVista
      pestana={pestana}
      filtro={filtro}
      grupos={estado.grupos}
      items={items}
      noLeidas={estado.noLeidas}
      pagina={pagina}
      totalPaginas={totalPaginas}
      cargando={cargando}
      error={error}
      marcandoTodas={marcandoTodas}
      onCambiarPestana={cambiarPestana}
      onPagina={irAPagina}
      onRevisar={(aviso) =>
        void abrirAviso(aviso, {
          marcarLeida: notificacionesAppApi.marcarLeida,
          alMarcar: marcarLocal,
          navegar: (href) => router.push(href),
        })
      }
      onMarcarLeida={(aviso) => void marcarLeida(aviso)}
      onMarcarGrupo={(g) => void marcarGrupo(g)}
      onMarcarTodas={() => void marcarTodas()}
      onReintentar={recargar}
      onNavegar={(href) => router.push(href)}
    />
  );
}

/** Lee ?tipo=&dia= y reinicia el historial (página 1) cuando cambian. */
function HistorialSegunUrl() {
  const searchParams = useSearchParams();
  const filtro = filtroDesdeUrl(searchParams);
  return <Historial key={`${filtro.tipo ?? ''}|${filtro.dia ?? ''}`} filtro={filtro} />;
}

export default function NotificacionesPage() {
  // useSearchParams necesita Suspense para el prerender de Next.
  return (
    <Suspense fallback={null}>
      <HistorialSegunUrl />
    </Suspense>
  );
}
