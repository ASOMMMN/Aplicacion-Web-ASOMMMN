/**
 * Siembra datos ficticios en el Mongo local de desarrollo (ver
 * dev-db-local.ts) para poder probar el panel de evaluador sin tocar la
 * base de Atlas real. Pensado para esa base local: por defecto apunta a
 * mongodb://127.0.0.1:27018/asommmn_dev y valida que la URI no sea de Atlas
 * antes de escribir nada.
 *
 * Es destructivo SOLO sobre esa base local: borra las colecciones que va a
 * repoblar (usuarios/postulantes/documentos/docs_personales/evaluaciones de
 * los `usuarioId`/`postulanteId` que él mismo crea) antes de insertar, así
 * que correrlo varias veces no acumula duplicados.
 *
 * Uso (con dev-db-local.ts ya corriendo en otra terminal):
 *   npx ts-node apps/api/scripts/seed-dev.ts [--uri "mongodb://127.0.0.1:27018/asommmn_dev"]
 */
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '../src/common/utils/password.util';

const URI_POR_DEFECTO = 'mongodb://127.0.0.1:27018/asommmn_dev';

function leerUri(): string {
  const idx = process.argv.indexOf('--uri');
  const uri = idx >= 0 ? process.argv[idx + 1] : URI_POR_DEFECTO;
  const esLocal =
    uri?.startsWith('mongodb://127.0.0.1') ||
    uri?.startsWith('mongodb://localhost');
  if (!esLocal) {
    console.error(
      'Por seguridad, seed-dev.ts solo acepta URIs locales (127.0.0.1/localhost). ' +
        'Recibido: ' +
        uri,
    );
    process.exit(1);
  }
  return uri;
}

const EVALUADOR_EMAIL = 'evaluador.prueba@asommmn.dev';
const EVALUADOR_PASSWORD = 'PruebaEvaluador123!';
const ADMIN_EMAIL = 'admin.prueba@asommmn.dev';
const ADMIN_PASSWORD = 'PruebaAdmin123!';

const VACANTES = [
  'Oficial de Máquinas',
  'Primer Oficial de Puente',
  'Jefe de Máquinas',
  '',
];
const CIUDADES: [string, string][] = [
  ['Veracruz', 'México'],
  ['Tampico', 'México'],
  ['Coatzacoalcos', 'México'],
  ['Ciudad de México', 'México'],
];

const REQUISITOS_PERSONALES = [
  'CURP',
  'INE',
  'acta_nacimiento',
  'pasaporte',
  'constancia_participacion',
  'certificado_medico',
  'libreta_identidad_maritima',
  'certificado_competencia',
] as const;

interface PlanPostulante {
  nombre: string;
  apellidos: string;
  /** Cuántos de los 8 requisitos personales (sin CV/vacante) tiene. 8 = completos. */
  docsPersonalesCompletos: number;
  tieneCV: boolean;
  tieneVacante: boolean;
  estadoExpediente: 'en_proceso' | 'enviado';
  /** De los documentos que tiene, cuántos ya fueron evaluados por el evaluador semilla. */
  docsEvaluados: number;
  diasDesdeRegistro: number;
  diasDesdeEnvio?: number;
}

function generarPlanes(cantidad: number): PlanPostulante[] {
  const nombres = [
    'María de los Ángeles',
    'Juan',
    'Carlos Eduardo',
    'Ana Sofía',
    'Luis',
    'Fernanda',
    'Jorge',
    'Alejandra',
    'Ricardo',
    'Patricia',
    'Miguel Ángel',
    'Daniela',
    'Francisco',
    'Gabriela',
    'Roberto',
  ];
  const apellidos = [
    'Galván',
    'de la Cruz',
    'Hernández Pérez',
    'López',
    'Martínez',
    'del Río',
    'Sánchez',
    'Ramírez',
    'Torres y Gómez',
    'Flores',
  ];

  const planes: PlanPostulante[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const nombre = nombres[i % nombres.length];
    const apellido = apellidos[i % apellidos.length];
    // Distribuye candidatos a lo largo de los 5 estados posibles.
    const grupo = i % 5;
    let plan: PlanPostulante;
    if (grupo === 0) {
      // Incompleto
      plan = {
        nombre,
        apellidos: apellido,
        docsPersonalesCompletos: Math.floor(Math.random() * 3),
        tieneCV: false,
        tieneVacante: Math.random() > 0.5,
        estadoExpediente: 'en_proceso',
        docsEvaluados: 0,
        diasDesdeRegistro: 2 + i,
      };
    } else if (grupo === 1) {
      // En proceso
      plan = {
        nombre,
        apellidos: apellido,
        docsPersonalesCompletos: 4 + (i % 4),
        tieneCV: true,
        tieneVacante: true,
        estadoExpediente: 'en_proceso',
        docsEvaluados: 0,
        diasDesdeRegistro: 5 + i,
      };
    } else if (grupo === 2) {
      // Completo (100% pero no enviado)
      plan = {
        nombre,
        apellidos: apellido,
        docsPersonalesCompletos: 8,
        tieneCV: true,
        tieneVacante: true,
        estadoExpediente: 'en_proceso',
        docsEvaluados: 0,
        diasDesdeRegistro: 8 + i,
      };
    } else if (grupo === 3) {
      // Enviado, sin evaluar
      plan = {
        nombre,
        apellidos: apellido,
        docsPersonalesCompletos: 8,
        tieneCV: true,
        tieneVacante: true,
        estadoExpediente: 'enviado',
        docsEvaluados: 0,
        diasDesdeRegistro: 15 + i,
        diasDesdeEnvio: (i % 7) + 1,
      };
    } else {
      // Evaluado (enviado + todos los docs con evaluación)
      plan = {
        nombre,
        apellidos: apellido,
        docsPersonalesCompletos: 8,
        tieneCV: true,
        tieneVacante: true,
        estadoExpediente: 'enviado',
        docsEvaluados: 11,
        diasDesdeRegistro: 20 + i,
        diasDesdeEnvio: 10 + (i % 5),
      };
    }
    planes.push(plan);
  }
  return planes;
}

async function main() {
  const uri = leerUri();
  await mongoose.connect(uri);
  console.log(`Conectado a: ${uri}`);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo obtener la conexión a la base.');

  // Limpieza idempotente: solo las colecciones que este script repuebla.
  await Promise.all([
    db
      .collection('usuarios')
      .deleteMany({ email: { $regex: /@asommmn\.dev$/ } }),
    db.collection('postulantes').deleteMany({}),
    db.collection('documentos').deleteMany({}),
    db.collection('docs_personales').deleteMany({}),
    db.collection('evaluaciones').deleteMany({}),
  ]);

  const ahora = Date.now();
  const diasAtras = (dias: number) =>
    new Date(ahora - dias * 24 * 60 * 60 * 1000);

  const evaluadorId = new Types.ObjectId();
  await db.collection('usuarios').insertOne({
    _id: evaluadorId,
    email: EVALUADOR_EMAIL,
    passwordHash: await hashPassword(EVALUADOR_PASSWORD),
    debeCambiarContrasena: false,
    rol: 'evaluador',
    estadoCuenta: 'activa',
    emailVerificado: true,
    emailVerificadoEn: diasAtras(90),
    nombre: 'Evaluadora',
    apellidos: 'De Prueba',
    creadoEn: diasAtras(90),
  });

  const adminId = new Types.ObjectId();
  await db.collection('usuarios').insertOne({
    _id: adminId,
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    debeCambiarContrasena: false,
    rol: 'administrador',
    estadoCuenta: 'activa',
    emailVerificado: true,
    emailVerificadoEn: diasAtras(90),
    nombre: 'Admin',
    apellidos: 'De Prueba',
    creadoEn: diasAtras(90),
  });

  const planes = generarPlanes(28);
  let creados = 0;

  for (const [idx, plan] of planes.entries()) {
    const usuarioId = new Types.ObjectId();
    const postulanteId = new Types.ObjectId();
    const creadoEn = diasAtras(plan.diasDesdeRegistro);
    const [ciudad, pais] = CIUDADES[idx % CIUDADES.length];
    const vacante = plan.tieneVacante
      ? VACANTES[idx % (VACANTES.length - 1)]
      : '';

    await db.collection('usuarios').insertOne({
      _id: usuarioId,
      email: `postulante${idx + 1}@asommmn.dev`,
      passwordHash: await hashPassword('PruebaPostulante123!'),
      debeCambiarContrasena: false,
      rol: 'postulante',
      estadoCuenta: 'activa',
      emailVerificado: true,
      emailVerificadoEn: creadoEn,
      nombre: plan.nombre,
      apellidos: plan.apellidos,
      creadoEn,
    });

    const enviadoEn =
      plan.diasDesdeEnvio != null ? diasAtras(plan.diasDesdeEnvio) : undefined;
    await db.collection('postulantes').insertOne({
      _id: postulanteId,
      usuarioId,
      ciudad,
      pais,
      vacante,
      estadoPostulacion: 'en_proceso',
      estadoExpediente: plan.estadoExpediente,
      ...(enviadoEn ? { enviadoEn } : {}),
      creadoEn,
      actualizadoEn: enviadoEn ?? creadoEn,
    });

    if (plan.tieneCV) {
      await db.collection('documentos').insertOne({
        postulanteId,
        usuarioId,
        nombreOriginal: `CV-${plan.nombre}-${plan.apellidos}.pdf`.replace(
          /\s+/g,
          '_',
        ),
        tipoMime: 'application/pdf',
        tamanio: 123_456,
        hash: `fake-hash-${idx}`,
        storagePath: `documentos/fake-${idx}.pdf`,
        storageType: 'cloudinary',
        version: 1,
        esActual: true,
        subidasPor: usuarioId,
        subidasEn: creadoEn,
      });
    }

    const tiposIncluidos = REQUISITOS_PERSONALES.slice(
      0,
      plan.docsPersonalesCompletos,
    );
    for (const tipo of tiposIncluidos) {
      await db.collection('docs_personales').insertOne({
        postulanteId,
        usuarioId,
        tipo,
        nombreOriginal: `${tipo}.pdf`,
        tipoMime: 'application/pdf',
        tamanio: 50_000,
        storagePath: `docs_personales/fake-${idx}-${tipo}.pdf`,
        storageType: 'cloudinary',
        subidasPor: usuarioId,
        subidasEn: creadoEn,
      });
    }

    if (plan.docsEvaluados > 0) {
      // docsTotal (CLAVES_REQUISITO.length) es 11: incluye 'vacuna_fiebre_amarilla',
      // que es opcional para el % de avance pero sí cuenta para "evaluado".
      const clavesEvaluables = [
        'cv',
        'vacante',
        'vacuna_fiebre_amarilla',
        ...tiposIncluidos,
      ].slice(0, plan.docsEvaluados);
      for (const clave of clavesEvaluables) {
        await db.collection('evaluaciones').insertOne({
          postulanteId,
          evaluadorId,
          documentoClave: clave,
          comentario: 'Documento en orden.',
          calificacion: 9,
          estadoSugerido: 'completado',
          nombreEvaluador: 'Evaluadora De Prueba',
          fechaEvaluacion: diasAtras(Math.max(plan.diasDesdeEnvio ?? 1, 1) - 1),
          resultadoEvaluacion: 'APROBADO',
          creadoEn: diasAtras(Math.max(plan.diasDesdeEnvio ?? 1, 1) - 1),
        });
      }
    }

    creados += 1;
  }

  console.log(`\nSembrados ${creados} postulantes de prueba.`);
  console.log('\nCredenciales de prueba:');
  console.log(`  Evaluador:     ${EVALUADOR_EMAIL} / ${EVALUADOR_PASSWORD}`);
  console.log(`  Administrador: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    '  Postulantes:   postulante1@asommmn.dev..postulante28@asommmn.dev / PruebaPostulante123!',
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('El seed falló:', err);
  await mongoose.disconnect();
  process.exit(1);
});
