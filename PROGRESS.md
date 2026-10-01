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
- `ia/combinar-fuentes.ts`: módulo puro que combina lecturas deterministas
  e IA (prioridad, Coincidente, grupos, principal, motivos). 10 tests.
- Motor conectado (`extraer-fechas-doc-personal.ts`): etiquetas por página +
  `paginas[].estructuradas` → `combinarConIa` después de la validación de la
  IA, y se vuelve a validar el resultado combinado (orden, rango, fechas
  futuras, tipos que no vencen). `detalleFechasIa` guarda `fuentes`,
  `grupos`, `principal` y `evidenciaEstructurada` (texto del QR/cadena).
  El prompt incluye `ETIQUETAS_POR_TIPO_DESCRIPCION`.
- API: `fuentesFechas` (fuente y coincidente por fecha) y
  `documentosDetectados` (si hay más de uno) en `DocPersonalResponseDto` y en
  `docPersonal` del resumen de fechas. Se omiten con fechas verificadas y en
  documentos analizados antes de este cambio. 10 tests de integración
  (`combinar-con-ia.spec.ts`, incluye un QR real con OpenAI simulado).

Estado al 2026-10-01: typecheck de API y web OK, Jest 20 suites / 174 tests
OK, ESLint sin errores en los archivos tocados.

## Falta

- Interfaz: badges de fuente/estado y documentos detectados.
- Script de diagnóstico con lecturas por fuente y grupo.
- Prueba con documentos reales.
- Si la IA falla (sin saldo, JSON inválido), hoy no se guarda nada aunque
  haya QR o etiquetas legibles. Posible mejora: usar solo las deterministas.
- Los documentos ya analizados no tienen `fuentes` hasta volver a
  analizarlos (análisis global o "Volver a analizar").

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
- Si la IA da un campo que el principal no tiene y esa fecha es de otro
  grupo, no se usa (no se mezclan documentos) y se marca "Revisar".
- Las validaciones de orden, rango y fechas futuras se aplican al resultado
  combinado, no solo a la propuesta de la IA.

## Siguientes pasos

1. Badges de fuente y estado en `ResumenFechasTabla.tsx`; lecturas por
   fuente y grupo en `probar-extraccion-archivo.ts`.
2. Prueba con documentos reales (constancia SEMAR/DGMM, refrendo, INE,
   constancia FIDENA, PDF con varios documentos).

## Otros hallazgos

- `qr-cadena.spec.ts` fallaba de forma intermitente con la suite completa
  (decodificar un QR cuesta ~5 s de CPU, justo el timeout de Jest). Resuelto
  con timeout de 30 s (`85c070d`).

- `apps/web/` contiene un `.git` anidado antiguo (último commit 31-jul) con
  cambios propios; el repo principal ya controla `apps/web`. Revisar o
  eliminar más adelante.

## Historial

- 2026-10-01: diagnóstico de la sesión cortada; push de `b4ae5da`,
  `f155e90` y `839f6f2`; se crea este archivo.
- 2026-10-01: plan de combinación de fuentes.
- 2026-10-01: `combinar-fuentes.ts` con tests (`7088fa7`).
- 2026-10-01: motor conectado, DTO y prompt.
