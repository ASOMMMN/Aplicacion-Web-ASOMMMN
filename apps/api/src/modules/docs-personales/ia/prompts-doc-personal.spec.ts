import { TIPOS_DOC_PERSONAL } from '../constants/tipos-doc-personal';
import { normalizarRespuesta } from './extraer-fechas-doc-personal';
import {
  construirPromptDocPersonal,
  construirPromptImagenDocPersonal,
  REGLAS_POR_TIPO,
  SYSTEM_PROMPT_DOC_PERSONAL,
} from './prompts-doc-personal';

describe('prompts de documentos personales', () => {
  it('hay reglas específicas para cada tipo, incluido refrendo', () => {
    for (const tipo of TIPOS_DOC_PERSONAL) {
      expect(REGLAS_POR_TIPO[tipo].trim().length).toBeGreaterThan(50);
    }
    expect(TIPOS_DOC_PERSONAL).toContain('refrendo');
  });

  it('certificado médico: etiquetas reales de emisión y vencimiento (ES/EN)', () => {
    const r = REGLAS_POR_TIPO.certificado_medico;
    expect(r).toContain('Fecha en la que se realizó el reconocimiento médico');
    expect(r).toContain('Date on which medical examination was carried out');
    expect(r).toContain('Fecha en la que expira el certificado médico');
    expect(r).toContain('Expiration date of medical certificate');
  });

  it('INE: emisión y vencimiento salen de VIGENCIA (año); ignora el año de registro', () => {
    expect(REGLAS_POR_TIPO.INE).toMatch(/PRIMER año de VIGENCIA/);
    expect(REGLAS_POR_TIPO.INE).toMatch(/SEGUNDO año de VIGENCIA/);
    expect(REGLAS_POR_TIPO.INE).toMatch(/precision "anio"/);
    expect(REGLAS_POR_TIPO.INE).toMatch(/AÑO DE REGISTRO/);
  });

  it('prompt base: México es dd/mm y los casos ambiguos bajan la confianza', () => {
    expect(SYSTEM_PROMPT_DOC_PERSONAL).toMatch(/dd\/mm\/aaaa/);
    expect(SYSTEM_PROMPT_DOC_PERSONAL).toMatch(/ambos ≤ 12/);
  });

  it('pide valor, texto literal, etiqueta, confianza, precisión y tipo detectado', () => {
    const p = construirPromptImagenDocPersonal('libreta_identidad_maritima');
    for (const clave of [
      'tipoDetectado',
      'formatoFechaIndicado',
      '"valor"',
      '"textoLiteral"',
      '"etiqueta"',
      '"confianza"',
      '"precision"',
    ]) {
      expect(p).toContain(clave);
    }
    expect(p).toContain('Libreta de identidad marítima');
  });

  it('incluye el texto del PDF cuando lo hay', () => {
    expect(construirPromptDocPersonal('VIGENCIA 2031', 'INE')).toContain(
      'VIGENCIA 2031',
    );
  });

  it('curso: "Date of course" y "Date of completion" cuentan como emisión', () => {
    expect(REGLAS_POR_TIPO.curso).toContain('Date of course');
    expect(REGLAS_POR_TIPO.curso).toContain('Date of completion');
  });

  it('refrendo: "Date of revalidation" cuenta como emisión', () => {
    expect(REGLAS_POR_TIPO.refrendo).toContain('Date of revalidation');
  });
});

describe('normalizarRespuesta', () => {
  it('formato nuevo: conserva la evidencia de cada fecha', () => {
    const r = normalizarRespuesta({
      tipoDetectado: 'certificado_medico',
      formatoFechaIndicado: 'dd/mm/aaaa',
      fechaEmision: {
        valor: '2025-12-19',
        textoLiteral: '19/12/2025',
        etiqueta: 'Date on which medical examination was carried out',
        confianza: 'alta',
        precision: 'dia',
      },
      fechaInicio: { valor: null, confianza: 'alta' },
      fechaVencimiento: {
        valor: '2027-12-19',
        textoLiteral: '19/12/2027',
        etiqueta: 'Expiration date of medical certificate',
        confianza: 'alta',
      },
    });
    expect(r.fechaEmision).toBe('2025-12-19');
    expect(r.fechaVencimiento).toBe('2027-12-19');
    expect(r.detalle?.fechaVencimiento.textoLiteral).toBe('19/12/2027');
    expect(r.detalle?.fechaVencimiento.precision).toBe('dia');
    // sin valor la confianza nunca es alta
    expect(r.confianza.fechaInicio).toBe('baja');
    expect(r.tipoDetectado).toBe('certificado_medico');
    expect(r.formatoFechaIndicado).toBe('dd/mm/aaaa');
  });

  it('formato anterior (string + confianza aparte) sigue funcionando', () => {
    const r = normalizarRespuesta({
      fechaVencimiento: '2031-01-15',
      confianza: { fechaVencimiento: 'media' },
    });
    expect(r.fechaVencimiento).toBe('2031-01-15');
    expect(r.confianza.fechaVencimiento).toBe('media');
  });
});
