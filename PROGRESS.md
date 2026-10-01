# Progreso — extracción de fechas en `docs-personales/ia`

Última actualización: 2026-10-01

## Objetivo

Extraer de forma confiable las fechas (emisión, inicio, vencimiento) de los
documentos personales de los candidatos (refrendos, INE, constancias
SEMAR/DGMM…), combinando fuentes deterministas con la IA:

**QR / cadena original > extractor por etiquetas (capa de texto) > IA**

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
`extraer-fechas-doc-personal.ts` no llama a `extraerPorEtiquetas` ni lee
`paginas[].estructuradas`. Falta la combinación de fuentes (diseño abajo).

## Diseño: combinación de fuentes (decidido 2026-10-01)

### Ya decidido en el código (se respeta)

- Prioridad por campo: `qr` (QR o cadena original) > `texto` (etiquetas
  sobre la capa de texto) > `ia`.
- Una lectura `qr` basta sola para "Coincidente".
- Las lecturas se comparan por `clave` (`claveFecha`), que conserva la
  precisión: "2016" ≠ "2016-01-01".
- `fechasVerificadas` siempre gana: un análisis nunca toca las fechas ni la
  marca "Revisar" de un documento verificado (solo guarda evidencia).

### Decisiones nuevas

1. **Varios documentos.** Todos los grupos se guardan en `detalleFechasIa`
   (sin migrar el schema). Los campos oficiales (`fechaEmision`,
   `fechaInicio`, `fechaVencimiento`, `precisionFechas`) toman el grupo con
   el **vencimiento más reciente**. Si hay más de 1 grupo: motivo "Se
   detectaron N documentos en el archivo" y `revisarFechas = true`.
2. **Conflicto.** Por campo gana la fuente de mayor prioridad; se marca
   `revisarFechas` y el motivo incluye ambos valores y sus fuentes.
3. **Coincidente.** Por campo, en
   `detalleFechasIa.fuentes[campo] = { valor, precision, fuente, coincidente, lecturas[] }`.
   Es coincidente si la fuente es `qr`, o si una lectura determinista y la
   IA tienen la misma `clave`. Una fecha coincidente sube a confianza alta.
4. **IA contra grupos.** La IA se compara contra el grupo principal. Si
   coincide con otro grupo, se marca "Revisar". Sin lecturas deterministas,
   el flujo queda como hoy.
5. **Alcance.** `ocr`, `ia1` e `ia2` no se implementan ahora (OCR es fase 2).
   `ETIQUETAS_POR_TIPO_DESCRIPCION` se conecta al prompt. La URL de un QR
   solo se guarda como evidencia (no se abre).

### Detalles de implementación (elegidos al implementar)

- Los grupos del extractor son locales a cada texto (página y fuente). Para
  formar los documentos del archivo, se unen las lecturas de una misma
  página con fuentes distintas si comparten alguna `clave` en el mismo
  campo, y se unen grupos sin campos en conflicto (se complementan, p. ej.
  emisión en la página 1 y vencimiento en la 2).
- Principal: vencimiento más reciente; si ningún grupo tiene vencimiento,
  el primero en orden de aparición.
- Confianza: coincidente → alta; conflicto → baja; solo `texto` sin dato de
  la IA → media; solo IA → la que dejó la validación.
- Las validaciones de orden, rango y fechas futuras se aplican al resultado
  combinado, no solo a la propuesta de la IA.

## Siguientes pasos

1. `ia/combinar-fuentes.ts` (módulo puro) con tests.
2. Conectarlo en `extraer-fechas-doc-personal.ts`, guardar grupos, fuentes y
   evidencia en `detalleFechasIa`, campo opcional en el DTO y prompt con
   `ETIQUETAS_POR_TIPO_DESCRIPCION`.
3. Badges de fuente y estado en `ResumenFechasTabla.tsx`; lecturas por
   fuente y grupo en `probar-extraccion-archivo.ts`.
4. Prueba con documentos reales (constancia SEMAR/DGMM, refrendo, INE,
   constancia FIDENA, PDF con varios documentos).

## Otros hallazgos

- `apps/web/` contiene un `.git` anidado antiguo (último commit 31-jul) con
  cambios propios; el repo principal ya controla `apps/web`. Revisar o
  eliminar más adelante.

## Historial

- 2026-10-01: diagnóstico de la sesión cortada; push de `b4ae5da`,
  `f155e90` y `839f6f2`; se crea este archivo.
- 2026-10-01: plan de combinación de fuentes.
