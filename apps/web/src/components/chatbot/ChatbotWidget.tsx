'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Spinner } from 'react-bootstrap';
import api from '@/lib/api/client';

interface MensajeItem {
  rol: 'usuario' | 'asistente' | 'whatsapp-card';
  contenido: string;
  creadoEn: string;
}

interface HistorialResponse {
  conversacionId: string;
  mensajes: MensajeItem[];
  intentosSinResolver: number;
  whatsappOfrecido: boolean;
  numeroWhatsapp?: string;
}

interface EnviarResponse {
  respuesta: string;
  mostrarWhatsapp: boolean;
  numeroWhatsapp?: string;
}

interface ConversacionItem {
  id: string;
  preview: string;
  totalMensajes: number;
  creadoEn: string;
  ultimoMensajeEn?: string;
  activa: boolean;
}

interface ListarResponse {
  conversaciones: ConversacionItem[];
}

interface EliminarResponse {
  eraActiva: boolean;
  nuevoHistorial?: HistorialResponse;
}

const BIENVENIDA =
  '¡Hola! Soy el asistente virtual de la ENMV. ¿En qué puedo ayudarte con tu postulación?';

const bienvenidaMsg = (): MensajeItem => ({
  rol: 'asistente',
  contenido: BIENVENIDA,
  creadoEn: new Date().toISOString(),
});

// Adjunta el mensaje especial de WhatsApp al final del historial si la conversación lo indica
// y el card aún no está en la lista.
function conCardWhatsapp(msgs: MensajeItem[], ofrecido: boolean): MensajeItem[] {
  if (!ofrecido || msgs.some((m) => m.rol === 'whatsapp-card')) return msgs;
  return [...msgs, { rol: 'whatsapp-card', contenido: '', creadoEn: new Date().toISOString() }];
}

const formatFecha = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const BTN_HDR: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,.75)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
};

export default function ChatbotWidget() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeItem[]>([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [historialCargado, setHistorialCargado] = useState(false);
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [panelHistorial, setPanelHistorial] = useState(false);
  const [conversaciones, setConversaciones] = useState<ConversacionItem[]>([]);
  const [cargandoConvs, setCargandoConvs] = useState(false);
  const [mostrarBurbuja, setMostrarBurbuja] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Se usa en el setTimeout del montaje para evitar closure sobre el estado inicial
  const abiertoRef = useRef(false);
  const burbujaYaMostradaRef = useRef(false);

  // Mantener ref sincronizada con estado abierto
  useEffect(() => {
    abiertoRef.current = abierto;
  }, [abierto]);

  // Scroll al fondo cuando cambian los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, escribiendo]);

  // Cargar conversación activa la primera vez que se abre el panel
  useEffect(() => {
    if (!abierto || historialCargado) return;

    const cargar = async () => {
      try {
        setCargando(true);
        const { data } = await api.get<HistorialResponse>('/chatbot/historial');
        const base = data.mensajes.length > 0 ? data.mensajes : [bienvenidaMsg()];
        setMensajes(conCardWhatsapp(base, data.whatsappOfrecido));
        setNumeroWhatsapp(data.numeroWhatsapp ?? '');
        setHistorialCargado(true);
      } catch {
        setMensajes([bienvenidaMsg()]);
        setHistorialCargado(true);
      } finally {
        setCargando(false);
      }
    };
    void cargar();
  }, [abierto, historialCargado]);

  // Focus al abrir
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [abierto]);

  // Mostrar burbuja de saludo una sola vez, 4 segundos después de montar
  useEffect(() => {
    const t = setTimeout(() => {
      if (!abiertoRef.current && !burbujaYaMostradaRef.current) {
        setMostrarBurbuja(true);
        burbujaYaMostradaRef.current = true;
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []); // intencional: solo al montar

  // Auto-cerrar la burbuja de saludo después de 15 segundos
  useEffect(() => {
    if (!mostrarBurbuja) return;
    const t = setTimeout(() => setMostrarBurbuja(false), 15000);
    return () => clearTimeout(t);
  }, [mostrarBurbuja]);

  const cargarConversaciones = useCallback(async () => {
    setCargandoConvs(true);
    try {
      const { data } = await api.get<ListarResponse>('/chatbot/conversaciones');
      setConversaciones(data.conversaciones);
    } catch {
      // conservar lista anterior en caso de error
    } finally {
      setCargandoConvs(false);
    }
  }, []);

  // ── Acciones ────────────────────────────────────────────────────────────────

  const abrirChat = () => {
    setMostrarBurbuja(false);
    setAbierto(true);
  };

  const iniciarNuevoChat = async () => {
    try {
      await api.post('/chatbot/nueva-conversacion');
    } catch {
      // el backend creará la conv nueva al próximo mensaje
    }
    setMensajes([bienvenidaMsg()]);
    setNumeroWhatsapp('');
    setInput('');
    setPanelHistorial(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const seleccionarConvHistorial = async (id: string) => {
    try {
      const { data } = await api.patch<HistorialResponse>(
        `/chatbot/conversaciones/${id}/seleccionar`,
      );
      const base = data.mensajes.length > 0 ? data.mensajes : [bienvenidaMsg()];
      setMensajes(conCardWhatsapp(base, data.whatsappOfrecido));
      setNumeroWhatsapp(data.numeroWhatsapp ?? '');
    } catch {
      // error silencioso
    } finally {
      setPanelHistorial(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  const eliminarConv = async (id: string) => {
    if (!window.confirm('¿Eliminar esta conversación? No se puede deshacer.')) return;
    try {
      const { data } = await api.delete<EliminarResponse>(`/chatbot/conversaciones/${id}`);
      if (data.eraActiva) {
        const h = data.nuevoHistorial;
        const base = h && h.mensajes.length > 0 ? h.mensajes : [bienvenidaMsg()];
        setMensajes(conCardWhatsapp(base, h?.whatsappOfrecido ?? false));
        setNumeroWhatsapp(h?.numeroWhatsapp ?? '');
      }
      await cargarConversaciones();
    } catch {
      // error silencioso
    }
  };

  const enviarMensaje = async () => {
    const texto = input.trim();
    if (!texto || escribiendo) return;

    setMensajes((prev) => [
      ...prev,
      { rol: 'usuario', contenido: texto, creadoEn: new Date().toISOString() },
    ]);
    setInput('');
    setEscribiendo(true);

    try {
      const { data } = await api.post<EnviarResponse>('/chatbot/mensaje', { mensaje: texto });
      if (data.numeroWhatsapp) setNumeroWhatsapp(data.numeroWhatsapp);
      setMensajes((prev) => {
        const yaHayCard = prev.some((m) => m.rol === 'whatsapp-card');
        const nuevos: MensajeItem[] = [
          ...prev,
          { rol: 'asistente', contenido: data.respuesta, creadoEn: new Date().toISOString() },
        ];
        if (data.mostrarWhatsapp && !yaHayCard) {
          nuevos.push({ rol: 'whatsapp-card', contenido: '', creadoEn: new Date().toISOString() });
        }
        return nuevos;
      });
    } catch {
      setMensajes((prev) => [
        ...prev,
        {
          rol: 'asistente',
          contenido:
            'No pude conectarme en este momento. Por favor intenta de nuevo en unos momentos.',
          creadoEn: new Date().toISOString(),
        },
      ]);
    } finally {
      setEscribiendo(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviarMensaje();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Panel de historial de conversaciones */}
      {abierto && panelHistorial && (
        <div
          style={{
            position: 'fixed',
            bottom: 104,
            right: 388,
            width: 260,
            maxWidth: 'calc(100vw - 408px)',
            height: 480,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(10,34,64,.28)',
            border: '1px solid rgba(10,34,64,.12)',
            zIndex: 9998,
            overflow: 'hidden',
          }}
        >
          {/* Encabezado historial */}
          <div
            style={{
              background: 'var(--enmv-azul)',
              borderBottom: '3px solid var(--enmv-dorado)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <i
              className="bi bi-clock-history"
              style={{ color: 'var(--enmv-dorado)', fontSize: '1rem', flexShrink: 0 }}
            />
            <span
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.875rem',
                flex: 1,
                lineHeight: 1.2,
              }}
            >
              Conversaciones
            </span>
            <button
              onClick={() => setPanelHistorial(false)}
              aria-label="Cerrar historial"
              style={BTN_HDR}
            >
              <i className="bi bi-x-lg" style={{ fontSize: '1rem' }} />
            </button>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--enmv-fondo)' }}>
            {cargandoConvs && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spinner animation="border" size="sm" />
              </div>
            )}

            {!cargandoConvs && conversaciones.length === 0 && (
              <p
                style={{
                  color: 'var(--enmv-text-muted)',
                  fontSize: '0.8rem',
                  textAlign: 'center',
                  padding: '24px 16px',
                  margin: 0,
                }}
              >
                No hay conversaciones anteriores.
              </p>
            )}

            {!cargandoConvs &&
              conversaciones.map((conv) => (
                <div
                  key={conv.id}
                  style={{
                    borderBottom: '1px solid rgba(10,34,64,.08)',
                    background: conv.activa ? 'rgba(201,162,75,.08)' : '#fff',
                  }}
                >
                  <button
                    onClick={() => void seleccionarConvHistorial(conv.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '10px 12px 4px 12px',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 4,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: '#1a2638',
                          fontWeight: conv.activa ? 600 : 400,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                          flex: 1,
                        }}
                      >
                        {conv.preview}
                      </span>
                      {conv.activa && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            background: 'var(--enmv-dorado)',
                            color: 'var(--enmv-azul)',
                            borderRadius: 999,
                            padding: '1px 6px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            lineHeight: 1.6,
                          }}
                        >
                          activa
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--enmv-text-muted)',
                        display: 'block',
                      }}
                    >
                      {formatFecha(conv.creadoEn)} · {conv.totalMensajes} msg
                    </span>
                  </button>
                  <div
                    style={{
                      padding: '2px 8px 8px 8px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      onClick={() => void eliminarConv(conv.id)}
                      aria-label="Eliminar conversación"
                      title="Eliminar conversación"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'rgba(10,34,64,.35)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Panel de chat */}
      {abierto && (
        <div
          style={{
            position: 'fixed',
            bottom: 104,
            right: 20,
            width: 360,
            maxWidth: 'calc(100vw - 40px)',
            height: 480,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(10,34,64,.28)',
            border: '1px solid rgba(10,34,64,.12)',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* Encabezado */}
          <div
            style={{
              background: 'var(--enmv-azul)',
              borderBottom: '3px solid var(--enmv-dorado)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--enmv-dorado)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="bi bi-robot" style={{ color: 'var(--enmv-azul)', fontSize: '1rem' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}
              >
                Asistente ENMV
              </div>
              <div style={{ color: 'var(--enmv-dorado)', fontSize: '0.7rem', lineHeight: 1.2 }}>
                Portal del Postulante
              </div>
            </div>
            <button
              onClick={() => {
                const abrir = !panelHistorial;
                setPanelHistorial(abrir);
                if (abrir) void cargarConversaciones();
              }}
              aria-label="Ver conversaciones anteriores"
              title="Historial de conversaciones"
              style={{
                ...BTN_HDR,
                background: panelHistorial ? 'rgba(201,162,75,.2)' : 'none',
                color: panelHistorial ? 'var(--enmv-dorado)' : 'rgba(255,255,255,.75)',
              }}
            >
              <i className="bi bi-clock-history" style={{ fontSize: '1rem' }} />
            </button>
            <button
              onClick={() => void iniciarNuevoChat()}
              aria-label="Nuevo chat"
              title="Nuevo chat"
              style={BTN_HDR}
            >
              <i className="bi bi-plus-circle" style={{ fontSize: '1rem' }} />
            </button>
            <button
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
              style={BTN_HDR}
            >
              <i className="bi bi-x-lg" style={{ fontSize: '1rem' }} />
            </button>
          </div>

          {/* Área de mensajes */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'var(--enmv-fondo)',
            }}
          >
            {cargando && mensajes.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flex: 1,
                }}
              >
                <Spinner animation="border" size="sm" />
              </div>
            )}

            {mensajes.map((msg, idx) => {
              if (msg.rol === 'whatsapp-card') {
                return (
                  <div
                    key={idx}
                    style={{
                      background: '#f0fff4',
                      border: '1.5px solid #25D366',
                      borderRadius: 12,
                      padding: '14px 16px',
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    <i
                      className="bi bi-whatsapp"
                      style={{
                        fontSize: '2rem',
                        color: '#25D366',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    />
                    <p
                      style={{
                        fontSize: '0.82rem',
                        color: '#1a2638',
                        margin: '0 0 12px',
                        lineHeight: 1.45,
                      }}
                    >
                      ¿No pudimos resolver tu duda? Contáctanos por WhatsApp
                    </p>
                    <a
                      href={numeroWhatsapp ? `https://wa.me/${numeroWhatsapp}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        background: '#25D366',
                        color: '#fff',
                        borderRadius: 24,
                        padding: '8px 12px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        textAlign: 'center',
                      }}
                    >
                      <i className="bi bi-whatsapp" style={{ marginRight: 6 }} />
                      Contactar por WhatsApp
                    </a>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: msg.rol === 'usuario' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius:
                        msg.rol === 'usuario' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.rol === 'usuario' ? 'var(--enmv-azul)' : '#fff',
                      color: msg.rol === 'usuario' ? '#fff' : '#1a2638',
                      fontSize: '0.84rem',
                      lineHeight: 1.55,
                      boxShadow: '0 1px 4px rgba(10,34,64,.1)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.contenido}
                  </div>
                </div>
              );
            })}

            {escribiendo && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '14px 14px 14px 4px',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(10,34,64,.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span className="chatbot-dot" />
                  <span className="chatbot-dot" />
                  <span className="chatbot-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Campo de entrada */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid rgba(10,34,64,.1)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexShrink: 0,
              background: '#fff',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="chatbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              disabled={escribiendo || cargando}
              style={{
                flex: 1,
                border: '1px solid rgba(10,34,64,.2)',
                borderRadius: 24,
                padding: '7px 14px',
                fontSize: '0.84rem',
                outline: 'none',
                background: escribiendo || cargando ? '#f0f0f0' : 'var(--enmv-fondo)',
                color: '#1a2638',
                transition: 'border-color .2s',
              }}
            />
            <button
              onClick={() => void enviarMensaje()}
              disabled={!input.trim() || escribiendo || cargando}
              aria-label="Enviar mensaje"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background:
                  input.trim() && !escribiendo ? 'var(--enmv-azul)' : 'rgba(10,34,64,.18)',
                border: 'none',
                color: '#fff',
                cursor: input.trim() && !escribiendo ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background .2s',
              }}
            >
              {escribiendo ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <i className="bi bi-send-fill" style={{ fontSize: '0.85rem' }} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Widget flotante: burbuja + botón + etiqueta en un único contenedor flex.
          Nada usa position:absolute con coordenadas propias respecto al viewport:
          cada elemento ocupa su espacio en el flujo, así que no pueden traslaparse. */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {/* Fila superior: burbuja de saludo (si aplica) + botón circular, uno junto al otro */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {mostrarBurbuja && !abierto && (
            <div
              style={{
                position: 'relative',
                background: 'var(--enmv-azul)',
                border: '2px solid var(--enmv-dorado)',
                borderRadius: 12,
                padding: '10px 28px 10px 12px',
                boxShadow: '0 4px 16px rgba(10,34,64,.35)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={abrirChat}
              role="button"
              aria-label="Abrir asistente virtual"
            >
              {/* Botón cerrar burbuja */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMostrarBurbuja(false);
                }}
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 7,
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,.6)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '1rem',
                  lineHeight: 1,
                }}
                aria-label="Cerrar burbuja"
              >
                ×
              </button>
              <p
                style={{
                  color: 'var(--enmv-dorado)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  margin: '0 0 2px',
                  whiteSpace: 'nowrap',
                }}
              >
                ¿Tienes dudas?
              </p>
              <p style={{ color: 'rgba(255,255,255,.9)', fontSize: '0.78rem', margin: 0, whiteSpace: 'nowrap' }}>
                ¡Pregúntame!
              </p>
              {/* Flecha (cola) apuntando hacia el botón — su largo coincide con el gap de 16px de la fila */}
              <div
                style={{
                  position: 'absolute',
                  right: -14,
                  top: '50%',
                  transform: 'translateY(-50%) rotate(45deg)',
                  width: 12,
                  height: 12,
                  background: 'var(--enmv-azul)',
                  borderTop: '2px solid var(--enmv-dorado)',
                  borderRight: '2px solid var(--enmv-dorado)',
                }}
              />
            </div>
          )}

          <button
            onClick={() => {
              setMostrarBurbuja(false);
              if (abierto) setPanelHistorial(false);
              setAbierto((prev) => !prev);
            }}
            aria-label={abierto ? 'Cerrar asistente virtual' : 'Abrir asistente virtual'}
            title="Asistente virtual ENMV"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--enmv-azul)',
              border: '3px solid var(--enmv-dorado)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(10,34,64,.35)',
              transition: 'transform .2s',
              flexShrink: 0,
            }}
          >
            <i
              className={abierto ? 'bi bi-x-lg' : 'bi bi-chat-dots-fill'}
              style={{ fontSize: '1.35rem' }}
            />
          </button>
        </div>

        {/* Etiqueta permanente: caja de 56px (mismo ancho que el botón) para quedar
            centrada respecto a él, no respecto a la fila completa (que puede ser más ancha
            cuando la burbuja está visible). */}
        {!abierto && (
          <div style={{ width: 56, display: 'flex', justifyContent: 'center' }}>
            <span
              onClick={() => setAbierto(true)}
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                background: '#0A2240',
                color: '#C9A24B',
                borderRadius: 999,
                padding: '2px 8px',
                fontWeight: 600,
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(10,34,64,.3)',
                border: '1px solid rgba(201,162,75,0.3)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              Asistente virtual
            </span>
          </div>
        )}
      </div>
    </>
  );
}
