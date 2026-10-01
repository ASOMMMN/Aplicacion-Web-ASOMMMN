# Progreso — extracción de fechas en `docs-personales/ia`

Última actualización: 2026-10-01

## Objetivo

Extraer de forma confiable las fechas (emisión, inicio, vencimiento) de los
documentos personales de los candidatos (refrendos, INE, constancias
SEMAR/DGMM…), combinando fuentes deterministas con la IA:

**QR / cadena original > extractor por etiquetas > OCR > IA**

Si una fuente determinista y la IA coinciden, la fecha es **"Coincidente"**.

## Terminado

- Lectura robusta de PDF e imágenes: páginas como imágenes, recorte,
  rotación y partes con resolución suficiente para escaneos
  (`lectura-documento.ts`, `preparar-imagen.ts`).
- Prompts por tipo con etiquetas reales y salida con evidencia
  (`prompts-doc-personal.ts`).
- Precisión de la fecha (día / mes / año) tomada del texto literal, no del
  modelo (`formatos-fecha.ts`, `validar-fechas-doc-personal.ts`).
- Validación, marca "Revisar" y corrección manual; estado de extracción
  visible por documento.
- Análisis desde la interfaz: por documento, por candidato y global (admin)
  (`analisis-global.service.ts`, `/analisis-documentos`).
- Errores 429 de OpenAI: se distingue "sin saldo" de "límite por minuto",
  con reintentos y pausas (`common/utils/openai-errores.util.ts`).
  `OPENAI_MODEL_DOCS` (gpt-4o) solo para documentos.
- Script de diagnóstico local: `apps/api/scripts/probar-extraccion-archivo.ts`.
- Extractor determinista por etiquetas ES/EN, que agrupa varios documentos
  en una hoja (`extractor-etiquetas.ts`, `etiquetas.ts`).
- Lectura de QR y cadena original (`qr-cadena.ts`), llamada desde
  `lectura-documento.ts`, que llena `paginas[].estructuradas`.

Estado al 2026-10-01: typecheck de API y web OK, Jest 18 suites / 154 tests
OK, ESLint sin errores en los archivos tocados. Commits subidos a
`origin/main` (hasta `839f6f2`).

## Falta

Las fuentes deterministas existen, pero **no llegan al resultado final**:

- `extraer-fechas-doc-personal.ts` no llama a `extraerPorEtiquetas` ni lee
  `paginas[].estructuradas`: los QR se decodifican (1.2–1.6 s de CPU por
  página) y se descartan. El commit `f155e90` anunciaba "se conecta al motor
  de extracción en el commit de varios documentos"; ese commit no existe.
- Falta la combinación por prioridad de fuentes y el estado "Coincidente"
  (no existe en el schema, los DTO ni la UI).
- Falta el soporte para varios documentos en un mismo archivo: el extractor
  ya agrupa, pero `DocPersonal` guarda un solo juego de fechas.
- `FuenteLectura` declara `'ocr'`, `'ia1'` e `'ia2'`, pero no hay OCR ni
  segunda pasada de IA (posible fase posterior).

## Siguientes pasos

1. **Conectar el motor**: en `extraerFechasDocPersonal`, correr
   `extraerPorEtiquetas` sobre el texto de cada página (fuente `texto`) y
   juntarlo con `paginas[].estructuradas` (fuente `qr`).
2. **Combinar con la IA**: aplicar la prioridad, marcar "Coincidente" cuando
   una fuente determinista y la IA coinciden, y "Revisar" cuando no.
   Reaprovechar `validar-fechas-doc-personal.ts`.
3. **Decidir el modelo de datos para varios documentos** (pendiente de
   decisión): guardarlos todos (schema, DTO, tabla del resumen) o conservar
   uno y avisar.
4. Mostrar la fuente / "Coincidente" en `ResumenFechasTabla.tsx` y las
   lecturas por fuente en `probar-extraccion-archivo.ts`.
5. Tests de la combinación de fuentes y prueba con documentos reales
   (constancia SEMAR, refrendo, INE).

## Otros hallazgos

- `apps/web/` contiene un `.git` anidado antiguo (último commit 31-jul) con
  cambios propios; el repo principal ya controla `apps/web`. Revisar o
  eliminar más adelante.

## Historial

- 2026-10-01: diagnóstico de la sesión cortada; push de `b4ae5da`,
  `f155e90` y `839f6f2`; se crea este archivo.
