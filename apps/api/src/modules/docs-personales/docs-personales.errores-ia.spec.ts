import { Types } from 'mongoose';
import { DocsPersonalesService } from './docs-personales.service';
import { resumenDocumentosPersonales } from '../resumen-fechas/docs-personales-resumen.util';
import { MENSAJE_IA_GENERICO } from '../../common/utils/mensaje-ia-usuario.util';

/**
 * QA (re-prueba): el reanálisis, el listado y el Resumen de fechas devolvían
 * "OpenAI sin saldo: recarga crédito (insufficient_quota)" en extraccionError.
 */
const PROVEEDOR = /openai|saldo|cr[eé]dito|credits|billing|quota|https?:/i;

function docConError(error: string) {
  return {
    _id: new Types.ObjectId(),
    tipo: 'INE',
    nombreOriginal: 'INE.pdf',
    extraccionEstado: 'error',
    extraccionError: error,
    analisisIa: { error },
  };
}

// resultadoAnalisis no usa dependencias: se prueba sin armar todo el servicio.
const servicio = Object.create(
  DocsPersonalesService.prototype,
) as DocsPersonalesService;

describe('errores de IA en documentos personales', () => {
  it('resultadoAnalisis (reanalizar): mensaje saneado y bandera iaNoDisponible', () => {
    const r = servicio.resultadoAnalisis(
      docConError(
        'OpenAI sin saldo: recarga crédito (insufficient_quota).',
      ) as never,
    );
    expect(r.extraccionEstado).toBe('error');
    expect(r.extraccionError).toBe(MENSAJE_IA_GENERICO);
    expect(r.extraccionError).not.toMatch(PROVEEDOR);
    expect(r.iaNoDisponible).toBe(true);
  });

  it('API key inválida también marca iaNoDisponible y no muestra el detalle', () => {
    const r = servicio.resultadoAnalisis(
      docConError(
        'Error de OpenAI: API key inválida o revocada (HTTP 401).',
      ) as never,
    );
    expect(r.iaNoDisponible).toBe(true);
    expect(r.extraccionError).not.toMatch(PROVEEDOR);
  });

  it('un error propio o de un documento puntual se conserva y no detiene el lote', () => {
    const r = servicio.resultadoAnalisis(
      docConError('PDF ilegible: archivo dañado') as never,
    );
    expect(r.extraccionError).toBe('PDF ilegible: archivo dañado');
    expect(r.iaNoDisponible).toBeUndefined();
  });

  it('el Resumen de fechas no expone el error del proveedor', () => {
    const filas = resumenDocumentosPersonales([
      {
        ...docConError(
          'OpenAI sin saldo: recarga crédito (insufficient_quota).',
        ),
        _id: new Types.ObjectId(),
        subidasEn: new Date('2026-01-01'),
      } as never,
    ]);
    const texto = JSON.stringify(filas);
    expect(texto).not.toMatch(PROVEEDOR);
    expect(filas[0].docPersonal?.extraccionError).toBe(MENSAJE_IA_GENERICO);
  });
});
