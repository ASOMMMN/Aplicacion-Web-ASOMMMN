/**
 * Repara, en los registros YA GUARDADOS, los nombres de archivo que quedaron
 * como mojibake por el bug de multer/busboy (UTF-8 leído como Latin-1,
 * p.ej. "MARÍA" guardado como "MARÃ­A"). El fix en el código (ver
 * src/common/utils/fix-mojibake.util.ts) solo corrige las subidas nuevas;
 * este script repara el historial.
 *
 * Recorre, por cada colección/campo:
 *   - cursos.documentoExtra.nombreOriginal
 *   - docs_personales.nombreOriginal
 *   - documentos.nombreOriginal (todas las versiones, no solo esActual)
 *   - postulante_nube_items.nombre
 *   - eval_archivos.nombre
 *   - documentos_nube.nombre
 *
 * Usa exactamente la misma función `corregirMojibakeLatin1` que ya protege
 * las subidas nuevas, así que es un no-op seguro para nombres que no están
 * corruptos (ASCII, o UTF-8 ya correcto).
 *
 * Registros NO recuperables (se listan, no se tocan):
 *   - El nombre contiene marcas de mojibake (Ã/Â seguido de un carácter de
 *     control o símbolo Latin-1) pero `corregirMojibakeLatin1` no pudo
 *     repararlo con una sola pasada Latin-1→UTF-8 (reparado inválido). Esto
 *     pasa normalmente cuando el nombre sufrió el bug DOS veces (p.ej. si
 *     alguien ya intentó "arreglarlo" a mano desde el endpoint de renombrar
 *     pegando el texto corrupto) — reparar eso a ciegas arriesga corromper
 *     el nombre de otra forma distinta, así que requieren revisión manual
 *     (y posiblemente aplicar la función dos veces, caso por caso).
 *   - Si los bytes originales ya se perdieron antes de llegar a Mongo (por
 *     ejemplo, si una versión vieja del driver o del navegador del usuario
 *     ya reemplazó bytes inválidos por el carácter de reemplazo U+FFFD antes
 *     de guardar), no hay forma de reconstruir el nombre original: esos
 *     también se listan como no recuperables.
 *
 * Por defecto es --dry-run (solo reporta). Con --ejecutar pide escribir el
 * nombre de la base para confirmar, igual que el resto de scripts de
 * /scripts, y antes de tocar la base guarda un respaldo JSON (valor
 * original y campo/colección/_id de cada registro) en
 * apps/api/reportes-ia/ (fuera de git) para poder revertir a mano si algo
 * salió mal.
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node apps/api/scripts/reparar-mojibake-nombres.ts --uri "<mongodb-uri>" [--ejecutar]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Document, ObjectId, WithId } from 'mongodb';

import { corregirMojibakeLatin1 } from '../src/common/utils/fix-mojibake.util';
import {
  conectar,
  confirmarEscritura,
  desconectar,
  leerArgs,
} from './lib/conexion-segura';

const USO = `Uso:
  npx ts-node apps/api/scripts/reparar-mojibake-nombres.ts --uri "<mongodb-uri>" [--dry-run | --ejecutar]`;

// Marca típica de UTF-8 mal leído como Latin-1: Ã/Â seguido de un carácter
// de control C1 o de un símbolo del bloque Latin-1 Supplement.
const PATRON_MOJIBAKE = /[ÂÃ][\u0080-¿]/;

interface Objetivo {
  coleccion: string;
  /** Ruta del campo, en notación de punto (soporta un nivel anidado). */
  campo: string;
  /** Filtro adicional para no traer de más (p.ej. solo docs con el campo). */
  filtro: Record<string, unknown>;
}

const OBJETIVOS: Objetivo[] = [
  {
    coleccion: 'cursos',
    campo: 'documentoExtra.nombreOriginal',
    filtro: { 'documentoExtra.nombreOriginal': { $type: 'string' } },
  },
  {
    coleccion: 'docs_personales',
    campo: 'nombreOriginal',
    filtro: { nombreOriginal: { $type: 'string' } },
  },
  {
    coleccion: 'documentos',
    campo: 'nombreOriginal',
    filtro: { nombreOriginal: { $type: 'string' } },
  },
  {
    coleccion: 'postulante_nube_items',
    campo: 'nombre',
    filtro: { nombre: { $type: 'string' } },
  },
  {
    coleccion: 'eval_archivos',
    campo: 'nombre',
    filtro: { nombre: { $type: 'string' } },
  },
  {
    coleccion: 'documentos_nube',
    campo: 'nombre',
    filtro: { nombre: { $type: 'string' } },
  },
];

function leerCampo(doc: WithId<Document>, campo: string): string | undefined {
  const partes = campo.split('.');
  let valor: unknown = doc;
  for (const p of partes) {
    if (valor == null || typeof valor !== 'object') return undefined;
    valor = (valor as Record<string, unknown>)[p];
  }
  return typeof valor === 'string' ? valor : undefined;
}

async function main() {
  const { uri, ejecutar } = leerArgs(USO);
  const { db, nombreBase } = await conectar(uri);
  try {
    type Plan = {
      _id: ObjectId;
      coleccion: string;
      campo: string;
      original: string;
      reparado: string;
    };
    const planReparar: Plan[] = [];
    const noRecuperables: {
      coleccion: string;
      _id: ObjectId;
      nombre: string;
    }[] = [];

    for (const { coleccion, campo, filtro } of OBJETIVOS) {
      const docs = await db.collection(coleccion).find(filtro).toArray();
      for (const doc of docs) {
        const original = leerCampo(doc, campo);
        if (original === undefined) continue;

        const reparado = corregirMojibakeLatin1(original);
        if (reparado !== original) {
          planReparar.push({
            _id: doc._id,
            coleccion,
            campo,
            original,
            reparado,
          });
          continue;
        }

        // No cambió nada: si de todos modos tiene pinta de mojibake, no se
        // pudo reparar en una sola pasada → no recuperable automáticamente.
        if (PATRON_MOJIBAKE.test(original)) {
          noRecuperables.push({ coleccion, _id: doc._id, nombre: original });
        }
      }
    }

    console.log(`\nNombres a reparar: ${planReparar.length}`);
    for (const p of planReparar) {
      console.log(
        `  [${p.coleccion}:${p._id.toString()}] ${p.campo}: "${p.original}" → "${p.reparado}"`,
      );
    }

    console.log(`\nNo recuperables automáticamente: ${noRecuperables.length}`);
    for (const n of noRecuperables) {
      console.log(
        `  [${n.coleccion}:${n._id.toString()}] "${n.nombre}" (revisar a mano)`,
      );
    }

    if (!ejecutar) {
      console.log('\nDRY-RUN: no se escribió nada.');
      return;
    }
    if (planReparar.length === 0) {
      console.log('\nNada que escribir.');
      return;
    }
    await confirmarEscritura(nombreBase);

    // Respaldo del valor original ANTES de escribir, para poder revertir a
    // mano si algún registro se repara mal.
    mkdirSync(resolve(__dirname, '../reportes-ia'), { recursive: true });
    const rutaRespaldo = resolve(
      __dirname,
      `../reportes-ia/respaldo-mojibake-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      rutaRespaldo,
      JSON.stringify(
        planReparar.map((p) => ({
          coleccion: p.coleccion,
          _id: p._id.toString(),
          campo: p.campo,
          original: p.original,
          reparado: p.reparado,
        })),
        null,
        2,
      ),
    );
    console.log(`\nRespaldo escrito en: ${rutaRespaldo}`);

    let escritos = 0;
    for (const p of planReparar) {
      const r = await db
        .collection(p.coleccion)
        .updateOne({ _id: p._id }, { $set: { [p.campo]: p.reparado } });
      escritos += r.modifiedCount;
    }
    console.log(`\nActualizados: ${escritos}.`);
  } finally {
    await desconectar();
  }
}

main().catch(async (err) => {
  console.error('El script falló:', (err as Error).message);
  await desconectar();
  process.exit(1);
});
