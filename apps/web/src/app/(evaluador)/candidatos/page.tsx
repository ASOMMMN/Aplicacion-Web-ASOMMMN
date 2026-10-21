'use client';

import { Alert, Col, Container, Row } from 'react-bootstrap';
import { SpinnerTimon } from '@/components/ui/NauticalIcons';
import { useCandidatosQuery } from '@/hooks/useCandidatosQuery';
import { KpiCards } from '@/components/candidatos/KpiCards';
import { FiltrosCandidatos } from '@/components/candidatos/FiltrosCandidatos';
import { TablaCandidatos } from '@/components/candidatos/TablaCandidatos';

export default function CandidatosPage() {
  const q = useCandidatosQuery();

  return (
    <div className="py-4 nautical-panel" style={{ minHeight: '100vh' }}>
      <Container fluid>
        {/* Header */}
        <Row className="align-items-end g-3 mb-4">
          <Col lg={8}>
            <span className="badge badge-pill-asommmn badge-estado-proceso mb-2">Evaluación</span>
            <h1 className="section-title">Panel de Evaluador</h1>
            <p className="text-muted mb-0">
              Revisa perfiles, CV y estado de postulación desde un solo lugar.
            </p>
          </Col>
          <Col lg={4} className="text-lg-end">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => void q.exportarCSV()}
              disabled={q.exportando}
            >
              {q.exportando ? <SpinnerTimon size={16} /> : <i className="bi bi-download me-1" />}
              Exportar CSV
            </button>
          </Col>
        </Row>

        {q.error && (
          <Alert variant="danger" className="shadow-sm d-flex justify-content-between align-items-center">
            <span>{q.error}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void q.reintentar()}>
              Reintentar
            </button>
          </Alert>
        )}

        <div className="horizonte-divider" />

        <KpiCards resumen={q.resumen} estadosActivos={q.estadoFiltro} vista={q.vista} onToggleEstado={q.toggleEstado} />

        <div className="horizonte-divider" />

        <FiltrosCandidatos
          search={q.search}
          setSearch={q.setSearch}
          vacanteFiltro={q.vacanteFiltro}
          toggleVacante={q.toggleVacante}
          vacantesCatalogo={q.vacantesCatalogo}
          estadoFiltro={q.estadoFiltro}
          toggleEstado={q.toggleEstado}
          setEstadoFiltro={q.setEstadoFiltro}
          avance={q.avance}
          setAvance={q.setAvance}
          docs={q.docs}
          setDocs={q.setDocs}
          fechaDesde={q.fechaDesde}
          setFechaDesde={q.setFechaDesde}
          fechaHasta={q.fechaHasta}
          setFechaHasta={q.setFechaHasta}
          actividadAntesDe={q.actividadAntesDe}
          setActividadAntesDe={q.setActividadAntesDe}
          limpiarFiltros={q.limpiarFiltros}
          vista={q.vista}
          setVista={q.setVista}
          esAdmin={q.esAdmin}
          origenEliminacion={q.origenEliminacion}
          setOrigenEliminacion={q.setOrigenEliminacion}
          papeleraCount={q.resumen?.eliminados}
          total={q.paginado?.total}
          totalSinFiltrarPorEstado={q.resumen?.total}
        />

        <TablaCandidatos
          items={q.items}
          paginado={q.paginado}
          loading={q.loading}
          refreshing={q.refreshing}
          ordenarPor={q.ordenarPor}
          direccion={q.direccion}
          toggleOrden={q.toggleOrden}
          vista={q.vista}
          page={q.page}
          setPage={q.setPage}
          onLimpiarFiltros={q.limpiarFiltros}
        />
      </Container>
    </div>
  );
}
