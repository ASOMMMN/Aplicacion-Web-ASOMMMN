/**
 * Prueba de consistencia: analiza cada archivo de una carpeta de muestras
 * varias veces (por defecto 3) con la canalización real y reporta si alguna
 * fecha cambió entre corridas. No usa la caché (cada corrida llama a
 * OpenAI) y no escribe en la base.
 *
 * Estructura de la carpeta (el nombre de la subcarpeta es el tipo):
 *   apps/api/muestras-ia/INE/ine-anverso.jpg
 *   apps/api/muestras-ia/pasaporte/pasaporte.pdf
 *   apps/api/muestras-ia/curso/control-multitudes.pdf
 * Tipos: los de documentos personales (INE, CURP, pasaporte, visa,
 * certificado_medico, libreta_identidad_maritima, certificado_competencia,
 * refrendo, acta_nacimiento, vacuna_fiebre_amarilla,
 * constancia_participacion) y "curso".
 *
 * La carpeta muestras-ia/ está en .gitignore: son documentos personales
 * reales. El reporte JSON se guarda dentro de la misma carpeta.
 *
 * Variables de entorno: OPENAI_API_KEY, OPENAI_MODEL_DOCS, OPENAI_SEED,
 * IA_DOCS_* (del proceso o de apps/api/.env).
 *
 * Uso (desde apps/api):
 *   npx ts-node scripts/probar-consistencia.ts [--carpeta muestras-ia] [--corridas 3] [--pausa 1000]
 */
import 'dotenv/config';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import {
  CAMPOS_FECHA,
  extraerFechasDocPersonal,
  modeloDocsDesdeEnv,
  ResultadoExtraccionFechas,
  seedDesdeEnv,
  VERSION_CANALIZACION,
} from '../src/modules/docs-personales/ia/extraer-fechas-doc-personal';
import { configLecturaDesdeEnv } from '../src/modules/docs-personales/ia/lectura-documento';
import {
  esTipoDocumentoIa,
  TipoDocumentoIa,
} from '../src/modules/docs-personales/ia/tipos-documento-ia';
import { formatearConPrecision } from '../src/modules/docs-personales/ia/formatos-fecha';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

interface Corrida {
  fechas: Record<string, string | null>;
  confianza: Record<string, string>;
  revisar: boolean;
  error: string | null;
  lecturas: number;
  tokensEntrada: number;
  ms: number;
}

interface ResultadoArchivo {
  tipo: string;
  archivo: string;
  corridas: Corrida[];
  estable: boolean;
  /** Campos cuya fecha cambió entre corridas. */
  cambios: string[];
}

const leer = (k: string) => process.env[k];
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function flag(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

/** Fecha mostrada con su precisión (lo que importa comparar). */
function fechasDe(r: ResultadoExtraccionFechas): Record<string, string | null> {
  const res = r.resultado;
  const campos: Record<string, string | null> = Object.fromEntries(
    CAMPOS_FECHA.map((c) => [
      c,
      res[c]
        ? (formatearConPrecision(res[c], res.detalle?.[c].precision) ?? res[c])
        : null,
    ]),
  );
  if (res.datosCurso) {
    const fin = res.datosCurso.fechaFinCurso;
    campos.fechaFinCurso = fin.valor
      ? (formatearConPrecision(fin.valor, fin.precision) ?? fin.valor)
      : null;
  }
  return campos;
}

async function main() {
  const carpeta = resolve(
    flag('carpeta', resolve(__dirname, '../muestras-ia')),
  );
  const corridas = Math.max(2, Number(flag('corridas', '3')) || 3);
  const pausa = Number(flag('pausa', '1000')) || 0;
  const apiKey = leer('OPENAI_API_KEY') ?? '';
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY.');
  const modelo = modeloDocsDesdeEnv(leer);

  let tipos: string[];
  try {
    tipos = readdirSync(carpeta).filter((d) =>
      statSync(join(carpeta, d)).isDirectory(),
    );
  } catch {
    throw new Error(
      `No existe la carpeta ${carpeta}. Crea subcarpetas por tipo (p. ej. muestras-ia/INE/).`,
    );
  }

  const archivos: Array<{
    tipo: TipoDocumentoIa;
    ruta: string;
    nombre: string;
  }> = [];
  for (const tipo of tipos) {
    if (!esTipoDocumentoIa(tipo)) {
      console.warn(`Se omite la carpeta "${tipo}": no es un tipo conocido.`);
      continue;
    }
    for (const nombre of readdirSync(join(carpeta, tipo))) {
      if (MIME[extname(nombre).toLowerCase()]) {
        archivos.push({ tipo, ruta: join(carpeta, tipo, nombre), nombre });
      }
    }
  }
  console.log(
    `${archivos.length} archivo(s) · ${corridas} corridas cada uno · modelo ${modelo} · canalización ${VERSION_CANALIZACION}\n`,
  );

  const resultados: ResultadoArchivo[] = [];
  for (const a of archivos) {
    const buffer = readFileSync(a.ruta);
    const mimeType = MIME[extname(a.nombre).toLowerCase()];
    const hechas: Corrida[] = [];
    for (let i = 0; i < corridas; i++) {
      const inicio = Date.now();
      const r = await extraerFechasDocPersonal({
        buffer,
        mimeType,
        tipo: a.tipo,
        apiKey,
        modelo,
        lectura: configLecturaDesdeEnv(leer),
        seed: seedDesdeEnv(leer),
        sinReextraer: a.tipo === 'curso',
        onError: (m) => console.error(`    [error] ${m}`),
      });
      hechas.push({
        fechas: fechasDe(r),
        confianza: { ...r.resultado.confianza },
        revisar: Boolean(r.resultado.revisar),
        error: r.resultado.errorMensaje ?? null,
        lecturas: r.resultado.lecturasIa?.length ?? 0,
        tokensEntrada: r.tokens?.entrada ?? 0,
        ms: Date.now() - inicio,
      });
      if (pausa) await dormir(pausa);
    }
    const campos = Object.keys(hechas[0].fechas);
    const cambios = campos.filter(
      (c) => new Set(hechas.map((h) => h.fechas[c] ?? '∅')).size > 1,
    );
    const conError = hechas.some((h) => h.error);
    const estable = cambios.length === 0 && !conError;
    resultados.push({
      tipo: a.tipo,
      archivo: a.nombre,
      corridas: hechas,
      estable,
      cambios,
    });

    const f = hechas[0].fechas;
    console.log(
      `${estable ? 'ESTABLE ' : 'CAMBIA  '} ${a.tipo} · ${a.nombre}\n` +
        `         emisión ${f.fechaEmision ?? '—'} · inicio ${f.fechaInicio ?? '—'} · vencimiento ${f.fechaVencimiento ?? '—'}` +
        (f.fechaFinCurso !== undefined
          ? ` · fin curso ${f.fechaFinCurso ?? '—'}`
          : '') +
        ` · lecturas por corrida ${hechas.map((h) => h.lecturas).join('/')}` +
        (conError
          ? `\n         ERROR: ${hechas.find((h) => h.error)?.error}`
          : '') +
        cambios
          .map(
            (c) =>
              `\n         ${c}: ${hechas.map((h, i) => `corrida ${i + 1} = ${h.fechas[c] ?? '—'}`).join(' · ')}`,
          )
          .join(''),
    );
  }

  const estables = resultados.filter((r) => r.estable).length;
  console.log(
    `\nResultado: ${estables} de ${resultados.length} archivo(s) devolvieron las mismas fechas en las ${corridas} corridas.`,
  );
  const ruta = join(
    carpeta,
    `_reporte-consistencia-${new Date().toISOString().slice(0, 16).replace(':', '-')}.json`,
  );
  writeFileSync(
    ruta,
    JSON.stringify(
      {
        modelo,
        versionCanalizacion: VERSION_CANALIZACION,
        corridas,
        resultados,
      },
      null,
      2,
    ),
  );
  console.log(`Reporte: ${ruta}`);
}

main().catch((err: Error) => {
  console.error(`Falló: ${err.message}`);
  process.exit(1);
});
