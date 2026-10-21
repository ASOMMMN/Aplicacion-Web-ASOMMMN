'use client';

import { useState } from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import { ESTADO_GENERAL_CONFIG, type EstadoGeneral } from '@/lib/estadoCandidato';
import type { NivelAvance, NivelDocs, OrigenEliminacion, Vista } from '@/hooks/useCandidatosQuery';

const LABEL_AVANCE: Record<NivelAvance, string> = {
  sin_avance: 'Sin avance',
  parcial: 'Avance parcial',
  completo: 'Avance completo',
};

const LABEL_DOCS: Record<NivelDocs, string> = {
  ninguno: 'Sin docs. evaluados',
  parcial: 'Docs. en evaluación',
  completo: 'Docs. evaluados completos',
};

function diasAtras(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function MultiSelectDropdown({
  id,
  label,
  opciones,
  seleccionados,
  onToggle,
  placeholder,
}: {
  id: string;
  label: string;
  opciones: { value: string; label: string }[];
  seleccionados: string[];
  onToggle: (valor: string) => void;
  placeholder: string;
}) {
  const texto =
    seleccionados.length === 0
      ? placeholder
      : seleccionados.length === 1
        ? opciones.find((o) => o.value === seleccionados[0])?.label ?? seleccionados[0]
        : `${seleccionados.length} seleccionados`;

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        id={id}
        variant="outline-secondary"
        className="text-truncate"
        style={{ maxWidth: 190 }}
        aria-label={`${label}: ${texto}`}
      >
        {texto}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: 280, overflowY: 'auto', minWidth: 220 }}>
        {opciones.length === 0 ? (
          <div className="px-3 py-1 text-muted small">Sin opciones</div>
        ) : (
          opciones.map((o) => (
            <div key={o.value} className="px-3 py-1">
              <Form.Check
                type="checkbox"
                id={`${id}-${o.value}`}
                label={o.label}
                checked={seleccionados.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
            </div>
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface FiltrosCandidatosProps {
  search: string;
  setSearch: (v: string) => void;
  vacanteFiltro: string[];
  toggleVacante: (v: string) => void;
  vacantesCatalogo: string[];
  estadoFiltro: EstadoGeneral[];
  toggleEstado: (v: EstadoGeneral) => void;
  setEstadoFiltro: (v: EstadoGeneral[]) => void;
  avance: NivelAvance | '';
  setAvance: (v: NivelAvance | '') => void;
  docs: NivelDocs | '';
  setDocs: (v: NivelDocs | '') => void;
  fechaDesde: string;
  setFechaDesde: (v: string) => void;
  fechaHasta: string;
  setFechaHasta: (v: string) => void;
  actividadAntesDe: string;
  setActividadAntesDe: (v: string) => void;
  limpiarFiltros: () => void;
  vista: Vista;
  setVista: (v: Vista) => void;
  esAdmin: boolean;
  origenEliminacion: OrigenEliminacion | '';
  setOrigenEliminacion: (v: OrigenEliminacion | '') => void;
  papeleraCount?: number;
  total?: number;
  totalSinFiltrarPorEstado?: number;
}

export function FiltrosCandidatos({
  search,
  setSearch,
  vacanteFiltro,
  toggleVacante,
  vacantesCatalogo,
  estadoFiltro,
  toggleEstado,
  setEstadoFiltro,
  avance,
  setAvance,
  docs,
  setDocs,
  fechaDesde,
  setFechaDesde,
  fechaHasta,
  setFechaHasta,
  actividadAntesDe,
  setActividadAntesDe,
  limpiarFiltros,
  vista,
  setVista,
  esAdmin,
  origenEliminacion,
  setOrigenEliminacion,
  papeleraCount,
  total,
  totalSinFiltrarPorEstado,
}: FiltrosCandidatosProps) {
  const [panelMovilAbierto, setPanelMovilAbierto] = useState(false);

  const opcionesEstado = Object.entries(ESTADO_GENERAL_CONFIG).map(([clave, cfg]) => ({
    value: clave,
    label: cfg.label,
  }));
  const opcionesVacante = vacantesCatalogo.map((v) => ({ value: v, label: v }));

  const chips: Chip[] = [
    ...(search ? [{ key: 'q', label: `Buscar: ${search}`, onRemove: () => setSearch('') }] : []),
    ...vacanteFiltro.map((v) => ({ key: `vacante-${v}`, label: `Vacante: ${v}`, onRemove: () => toggleVacante(v) })),
    ...estadoFiltro.map((e) => ({
      key: `estado-${e}`,
      label: `Estado: ${ESTADO_GENERAL_CONFIG[e].label}`,
      onRemove: () => toggleEstado(e),
    })),
    ...(avance ? [{ key: 'avance', label: LABEL_AVANCE[avance], onRemove: () => setAvance('') }] : []),
    ...(docs ? [{ key: 'docs', label: LABEL_DOCS[docs], onRemove: () => setDocs('') }] : []),
    ...(fechaDesde ? [{ key: 'fechaDesde', label: `Desde: ${fechaDesde}`, onRemove: () => setFechaDesde('') }] : []),
    ...(fechaHasta ? [{ key: 'fechaHasta', label: `Hasta: ${fechaHasta}`, onRemove: () => setFechaHasta('') }] : []),
    ...(actividadAntesDe
      ? [{ key: 'actividad', label: 'Sin actividad reciente', onRemove: () => setActividadAntesDe('') }]
      : []),
  ];

  const hayFiltrosActivos = chips.length > 0;

  const controles = (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      <MultiSelectDropdown
        id="candidatos-filtro-vacante"
        label="Vacante"
        placeholder="Vacante: todas"
        opciones={opcionesVacante}
        seleccionados={vacanteFiltro}
        onToggle={toggleVacante}
      />
      <MultiSelectDropdown
        id="candidatos-filtro-estado"
        label="Estado"
        placeholder="Estado: todos"
        opciones={opcionesEstado}
        seleccionados={estadoFiltro}
        onToggle={(v) => toggleEstado(v as EstadoGeneral)}
      />
      <Form.Label htmlFor="candidatos-filtro-avance" className="visually-hidden">
        Filtrar por avance de carga
      </Form.Label>
      <Form.Select
        id="candidatos-filtro-avance"
        value={avance}
        onChange={(e) => setAvance(e.target.value as NivelAvance | '')}
        style={{ minWidth: 150, maxWidth: 190 }}
      >
        <option value="">Avance: todos</option>
        <option value="sin_avance">Sin avance</option>
        <option value="parcial">Parcial</option>
        <option value="completo">Completo</option>
      </Form.Select>
      <Form.Label htmlFor="candidatos-filtro-docs" className="visually-hidden">
        Filtrar por documentos evaluados
      </Form.Label>
      <Form.Select
        id="candidatos-filtro-docs"
        value={docs}
        onChange={(e) => setDocs(e.target.value as NivelDocs | '')}
        style={{ minWidth: 150, maxWidth: 190 }}
      >
        <option value="">Docs. evaluados: todos</option>
        <option value="ninguno">Ninguno</option>
        <option value="parcial">Parcial</option>
        <option value="completo">Completo</option>
      </Form.Select>
      <Form.Label htmlFor="candidatos-fecha-desde" className="visually-hidden">
        Fecha de postulación desde
      </Form.Label>
      <Form.Control
        id="candidatos-fecha-desde"
        type="date"
        value={fechaDesde}
        onChange={(e) => setFechaDesde(e.target.value)}
        style={{ maxWidth: 160 }}
        title="Postulación desde"
      />
      <Form.Label htmlFor="candidatos-fecha-hasta" className="visually-hidden">
        Fecha de postulación hasta
      </Form.Label>
      <Form.Control
        id="candidatos-fecha-hasta"
        type="date"
        value={fechaHasta}
        onChange={(e) => setFechaHasta(e.target.value)}
        style={{ maxWidth: 160 }}
        title="Postulación hasta"
      />
    </div>
  );

  return (
    <div className="mb-3">
      {/* Toggle Activos/Eliminados (solo admin) + origen (solo en Eliminados) */}
      {esAdmin && (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
          <div className="btn-group" role="group" aria-label="Vista de candidatos">
            <button
              type="button"
              className={`btn btn-sm ${vista === 'activos' ? 'btn-primary' : 'btn-outline-primary'}`}
              aria-pressed={vista === 'activos'}
              onClick={() => setVista('activos')}
            >
              Activos
            </button>
            <button
              type="button"
              className={`btn btn-sm ${vista === 'papelera' ? 'btn-danger' : 'btn-outline-danger'}`}
              aria-pressed={vista === 'papelera'}
              onClick={() => setVista('papelera')}
            >
              <i className="bi bi-trash3-fill me-1" />
              Eliminados
              {papeleraCount !== undefined && <span className="badge bg-light text-dark ms-2">{papeleraCount}</span>}
            </button>
          </div>
          {vista === 'papelera' && (
            <>
              <Form.Label htmlFor="candidatos-filtro-origen" className="visually-hidden">
                Filtrar por origen de la eliminación
              </Form.Label>
              <Form.Select
                id="candidatos-filtro-origen"
                aria-label="Filtrar por origen de la eliminación"
                value={origenEliminacion}
                onChange={(e) => setOrigenEliminacion(e.target.value as OrigenEliminacion | '')}
                style={{ minWidth: 170, maxWidth: 200 }}
              >
                <option value="">Origen: todos</option>
                <option value="admin">Eliminado por admin</option>
                <option value="self">Autoeliminados</option>
                <option value="desconocido">Origen desconocido</option>
              </Form.Select>
            </>
          )}
        </div>
      )}

      {/* Presets */}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <button
          type="button"
          className={`btn btn-sm rounded-pill ${estadoFiltro.length === 1 && estadoFiltro[0] === 'enviado' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setEstadoFiltro(['enviado'])}
        >
          Por evaluar
        </button>
        <button
          type="button"
          className={`btn btn-sm rounded-pill ${avance === 'parcial' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setAvance('parcial')}
        >
          Carga incompleta
        </button>
        <button
          type="button"
          className={`btn btn-sm rounded-pill ${actividadAntesDe ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setActividadAntesDe(diasAtras(7))}
        >
          Sin actividad 7+ días
        </button>

        {/* Botón "Filtros" solo en móvil */}
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary d-md-none ms-auto"
          onClick={() => setPanelMovilAbierto((v) => !v)}
          aria-expanded={panelMovilAbierto}
          aria-controls="candidatos-filtros-panel-movil"
        >
          <i className="bi bi-funnel me-1" />
          Filtros
          {hayFiltrosActivos && <span className="badge bg-primary ms-1">{chips.length}</span>}
        </button>
      </div>

      {/* Buscador: siempre visible */}
      <div className="mb-2" style={{ maxWidth: 420 }}>
        <Form.Label htmlFor="candidatos-buscar" className="visually-hidden">
          Buscar candidatos
        </Form.Label>
        <Form.Control
          id="candidatos-buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo…"
        />
      </div>

      {/* Controles: inline en desktop, panel colapsable en móvil */}
      <div className="d-none d-md-block mb-2">{controles}</div>
      {panelMovilAbierto && (
        <div id="candidatos-filtros-panel-movil" className="d-md-none mb-2">
          {controles}
        </div>
      )}

      {/* Chips + limpiar + contador */}
      <div className="d-flex flex-wrap gap-2 align-items-center">
        {chips.map((chip) => (
          <span key={chip.key} className="badge bg-secondary-subtle text-dark border d-inline-flex align-items-center gap-1 py-1 px-2">
            {chip.label}
            <button
              type="button"
              className="btn-close"
              style={{ fontSize: '0.6rem' }}
              aria-label={`Quitar filtro: ${chip.label}`}
              onClick={chip.onRemove}
            />
          </span>
        ))}
        {hayFiltrosActivos && (
          <button type="button" className="btn btn-sm btn-link text-decoration-underline p-0" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
        <span className="small text-muted ms-auto">
          {hayFiltrosActivos && totalSinFiltrarPorEstado !== undefined
            ? `${total ?? 0} de ${totalSinFiltrarPorEstado}`
            : `${total ?? 0} candidatos`}
        </span>
      </div>
    </div>
  );
}
