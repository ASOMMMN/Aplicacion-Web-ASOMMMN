# Progreso — extracción de fechas en `docs-personales/ia`

Última actualización: 2026-10-05

## Corrección de exactitud y consistencia (2026-10-05)

Rama `fix/extraccion-fechas-consistencia`. Objetivo: el mismo documento
devuelve siempre las mismas fechas y son las correctas; ante la duda,
"Revisar" en vez de adivinar. Diagnóstico y plan en la conversación del
2026-10-05. Un commit por fase.

Decisiones del usuario:
1. Caché por hash del archivo (sha256 + modelo + versión de la canalización
   + tipo). "Volver a analizar" la omite.
2. Varios archivos del mismo tipo: NO mezclar campos de documentos
   distintos. Documento ganador = verificado, o el de vencimiento más lejano
   con confianza ≥ media; sus fechas van en bloque. Solo se completan campos
   vacíos con el mismo documento físico (anverso/reverso: mismo
   vencimiento, mismo número de documento o subidos juntos).
3. Reanálisis: si el análisis anterior es de una `versionCanalizacion`
   vieja y no está verificado, se reemplaza con motivo; la protección
   (propuesta en vez de reemplazo) aplica de esta versión en adelante.
   Antes de reanalizar en lote: reporte dry-run anterior → nueva.
4. Rango "del X al Y" = vigencia solo con etiqueta de vigencia; el periodo
   de impartición va a `fechaFinCurso` como evidencia.
5. Regla de +5 años (reactivada a propósito): SOLO cursos registrados con
   documento. Los del CV quedan sin vencimiento calculado ("Sin
   documento"). El vencimiento calculado se muestra SIEMPRE como "estimado
   (5 años)", nunca como del documento.
6. Doble lectura aceptada. Snapshot fechado más reciente de gpt-4o según
   `models.list`, en env.
7. Script de consistencia autorizado; muestras en `apps/api/muestras-ia/<tipo>/`
   (fuera de git).

Después de este plan (en este orden, cada uno con su commit): visor de
documentos → rediseño del resumen → expediente unificado. No usar campos
provisionales: leer `origenVencimiento`, `fechaEmision` y la confianza reales.

Fases:
- [x] **Fase 1 — parser.** `leerFechasLiteral` (todas las fechas con
  posición), `elegir-fecha-literal.ts` (MRZ > rango de vigencia > valor del
  modelo > cercanía a la etiqueta > única > más probable con Revisar), año
  pegado a la etiqueta, `mrz.ts` (TD3/MRV/TD1 con dígito verificador,
  vencimiento 20xx), `dd MMM aa`, ambigüedad siempre calculada,
  `detectarIndicadorFormato` + `formatoComprobado` (el mm/dd del modelo ya no
  cuenta), "hoy" de México en la validación (`common/utils/fecha-mexico.util.ts`)
  y en `fechaCurso` del web. Jest 23 suites / 227 tests.
- [x] **Fase 2 — consistencia.** Snapshot fechado `gpt-4o-2024-11-20`
  (documentos) y `gpt-4o-mini-2024-07-18` (chatbot y CV) como defaults y en
  `.env.example`; advertencia al arrancar si `OPENAI_MODEL_DOCS` es un alias.
  `seed` (`OPENAI_SEED`, por defecto 20261005). `json_schema` estricto en
  documentos (`esquema-respuesta.ts`, con `confianzaTipo` y variante "curso"),
  respaldo pdf-crudo (`text.format` + `max_output_tokens`) y CV
  (`ingest-ia/esquema-cv.ts`); verificados contra OpenAI con
  `scripts/verificar-esquemas-openai.ts` (archivos sintéticos). Doble lectura
  (`consenso-lecturas.ts`): imagen/escaneo/pdf-crudo siempre 2 lecturas
  (normal + alterna), 3.ª de desempate si no coinciden; PDF con texto solo si
  la IA y las deterministas difieren. Unánime → alta; mayoría → media; sin
  mayoría → baja + Revisar; evidencia en `detalleFechasIa.lecturasIa` y
  `consenso`. Clasificación por página (`PaginaLeida.escaneada`) y hasta 8
  páginas. Tipo equivocado con `confianzaTipo` alta → reextracción con las
  reglas del detectado + `tipoSospechoso` + Revisar. Caché por hash
  (`ExtraccionIaService`, colección `cache_extraccion_ia`, 180 días): la
  usan la subida y la vista previa; "Volver a analizar" y el lote la omiten
  y la actualizan. `VERSION_CANALIZACION` = 2026-10-05. Jest 25 / 250.
  En Render hay que poner `OPENAI_MODEL=gpt-4o-mini-2024-07-18` (hoy es el
  alias) y, opcional, `OPENAI_MODEL_DOCS=gpt-4o-2024-11-20`.
- [x] **Fase 3 — protección de datos.** `cambios-analisis.ts`: una fecha
  existente nunca se pisa con null (queda en `analisisIa.conservadas`); con
  un análisis de esta misma versión, una fecha distinta va a
  `propuestaFechasIa` (+ Revisar) y la evidencia de cada campo es la del
  análisis que produjo su valor; con versión vieja o sin versión se
  reemplaza y queda en `analisisIa.reemplazo`. Endpoints
  `POST /docs-personales/:id/propuesta/aceptar` y
  `DELETE /docs-personales/:id/propuesta` (auditados); la corrección manual
  borra la propuesta. Resumen por tipo (`docs-personales-resumen.util.ts`):
  documento ganador (verificado > vencimiento más lejano con confianza ≥
  media > más reciente con fechas) con sus fechas en bloque; los campos
  vacíos solo se completan con el mismo documento físico (mismo
  vencimiento, o subidos con ≤ 15 min de diferencia y sin contradicciones),
  con `fechasDeOtroArchivo` y `archivosDelTipo`. Tabla actual: aviso "Nueva
  lectura pendiente de confirmar" con Aceptar/Descartar. Script
  `scripts/reanalizar-docs-personales.ts`: dry-run (llama a OpenAI, no
  escribe; reporte JSON + CSV anterior → nueva en `apps/api/reportes-ia/`,
  fuera de git) y `--ejecutar --reporte` que aplica exactamente lo revisado
  (salta los que cambiaron desde el reporte). `muestras-ia/` y
  `reportes-ia/` en .gitignore. Jest 25 / 264.
- [ ] Fase 4 — cursos (canalización unificada, schema, regla de 5 años,
  migración).
- [ ] Fase 5 — script de consistencia.

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

- Interfaz (`ResumenFechasTabla.tsx`): junto a cada fecha, badge de fuente
  (QR, Etiqueta, IA) y de estado (Coincidente en verde, Revisar en ámbar;
  Revisar = la fecha quedó en confianza baja). Si el archivo trae varios
  documentos, aviso "N documentos en el archivo" que despliega cada uno con
  sus fechas y cuál está en uso. `fuentesFechas[campo].revisar` en la API.
- Script de diagnóstico: lecturas deterministas por fuente, página y grupo;
  documentos detectados con el principal; estado por fecha con sus
  lecturas; evidencia de QR/cadena; tiempo de lectura (ms/página) y del
  modelo. Las lecturas se calculan antes de llamar al modelo, así que se
  ven aunque la IA falle.

Estado al 2026-10-01: typecheck de API y web OK, Jest 20 suites / 175 tests
OK. ESLint completo: 196 problemas en la API y 1 en el web, todos previos y
en archivos que este trabajo no toca (ver "Otros hallazgos"). La interfaz
no se probó en el navegador (necesita la app con base de datos y
documentos re-analizados).

## Falta

1. **Prueba con documentos reales** (bloqueada: faltan las rutas). Correr
   `probar-extraccion-archivo.ts` con la constancia SEMAR/DGMM, el refrendo
   escaneado, la INE, la constancia FIDENA y un PDF con varios documentos;
   tabla esperado vs. obtenido, fuente, estado, principal y ms/página.
   Contar cuántos fallan por falta de capa de texto: eso decide si entra
   OCR.
2. **OCR (fase 2, `fuente: 'ocr'`)**: para escaneos sin capa de texto, el
   único lector determinista hoy es el QR, y en refrendos escaneados no se
   alcanza a leer (pequeño y borroso). Depende del punto 1. Ya está previsto
   en `FuenteLectura` y en la prioridad (`qr > texto > ocr > ia`).
3. **Segunda pasada de IA (`ia2`)**: no implementada. Idea: segunda lectura
   independiente (otro recorte o modelo) cuando no hay fuente determinista,
   para poder dar "Coincidente" sin QR ni texto. Hoy `ia1`/`ia2` se tratan
   como `ia` en `combinar-fuentes.ts`. Decidir después del punto 1 (cuesta
   el doble de tokens por documento).
4. Ver la interfaz funcionando con documentos re-analizados.
5. Si la IA falla (sin saldo, JSON inválido), hoy no se guarda nada aunque
   haya QR o etiquetas legibles. Posible mejora: usar solo las
   deterministas (las lecturas ya se calculan antes de llamar al modelo).
6. Los documentos ya analizados no tienen `fuentes` hasta volver a
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

Ver "Falta": primero la prueba con documentos reales (1); de ella dependen
OCR (2) e `ia2` (3).

## Otros hallazgos

- `qr-cadena.spec.ts` fallaba de forma intermitente con la suite completa
  (decodificar un QR cuesta ~5 s de CPU, justo el timeout de Jest). Resuelto
  con timeout de 30 s (`85c070d`).

- `apps/web/.git` (repo anidado, revisado 2026-10-01): 2 commits (23 y
  31-jul), sin stash ni ramas extra, `main` = `origin/main`
  (`MarcoAntonioLagunes/ASOMMMN-APP-WEB`, ya subido). De los 77 archivos de
  cada commit, 76 existen idénticos en el repo principal; el único que no
  es `dev.log` (749 bytes de log de `next dev`, ignorado por `*.log`). No es
  submódulo (sin `.gitmodules` ni gitlink) y no tiene hooks. Sus "cambios"
  son el directorio de trabajo, que el repo principal siguió modificando.
  Conclusión: **se puede borrar sin perder datos**; no se borró. Única
  precaución: si algún sitio de Netlify está enlazado a `ASOMMMN-APP-WEB`,
  sigue en la versión del 31-jul (borrar el `.git` local no lo cambia).
- ESLint completo (sin `--fix`), previo a este trabajo: 196 problemas en la
  API en 23 archivos (sobre todo `no-unsafe-*` en `evaluaciones.service.ts`,
  `main.ts`, `postulantes.service.ts`, `mfa.service.ts`; 51 de formato) y 1
  en el web (`react-hooks/set-state-in-effect` en `NotificacionesBell.tsx`).
  Ojo: `npm run lint` de la API usa `--fix` y reescribe archivos.

## Bug de sesión en producción (2026-10-01)

Síntoma: tras un deploy, un usuario con sesión abierta veía "Sesión
expirada", luego "ThrottlerException: Too Many Requests" en el panel y "No
se pudo cerrar la sesión"; en incógnito funcionaba.

Causa: el deploy no invalida tokens (`JWT_SECRET` de entorno; refresh tokens
aleatorios en Mongo); solo provoca una recarga que pierde el access token en
memoria. Tras recargar, el layout y el interceptor renovaban en paralelo con
la misma cookie; la rotación invalida la cookie en el primer uso y el
segundo recibía 401. El fallo redirigía a /login sin borrar `user_role`, el
proxy devolvía al panel y se repetía hasta el 429. El logout exigía access
token y `clearCookie` no repetía `SameSite=None; Secure`, así que en
producción la cookie vieja nunca se borraba.

Corregido:
- `c05472a`: `refrescarSesion()` compartida (web/`lib/auth`), solo un 401
  del refresh limpia la sesión y redirige una vez; 429 o red solo informan.
  `cerrarSesion()` siempre limpia lo local. Interceptor sin reintento en
  `/auth/*` ni ante 429. `/auth/logout` sin `JwtAuthGuard` y con
  `@SkipThrottle`; `clearCookie` con las opciones de `COOKIE_OPTS`.
- `3e97caa`: rotación atómica (`findOneAndDelete`) y tests HTTP de logout y
  refresh (`auth.controller.spec.ts`, 5).

Pendiente: verificación manual en el navegador tras el deploy (pasos en la
conversación del 2026-10-01: un solo `/auth/refresh` al recargar, logout con
token vencido, sin bucle ante 401/429). `apps/web` no tiene tests
automatizados. `useAuth` no se usa en ninguna página (se migró igual).

## Historial

- 2026-10-01: diagnóstico de la sesión cortada; push de `b4ae5da`,
  `f155e90` y `839f6f2`; se crea este archivo.
- 2026-10-01: plan de combinación de fuentes.
- 2026-10-01: `combinar-fuentes.ts` con tests (`7088fa7`).
- 2026-10-01: motor conectado, DTO y prompt (`3fb1397`).
- 2026-10-01: badges en la interfaz y diagnóstico por fuente en el script
  (`62b69dc`).
- 2026-10-01: revisión del `.git` anidado, verificación completa y push.
- 2026-10-01: bug de sesión en producción (`c05472a`, `3e97caa`).
- 2026-10-05: plan de exactitud y consistencia; fase 1 (parser).
- 2026-10-05: fase 2 (consistencia: snapshot, seed, esquema estricto, doble lectura, caché).
- 2026-10-05: fase 3 (protección de datos, resumen multi-archivo, script de reanálisis).
