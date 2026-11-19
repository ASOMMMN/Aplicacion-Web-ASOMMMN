# Despliegue de staging — guía paso a paso

Objetivo: probar la aplicación completa (web + API + base de datos + S3 + IA) **sin tocar producción**. Esta guía no pide valores reales en ningún lado: los secretos los generas tú y se guardan solo en los paneles (Render, Netlify, AWS, Atlas, OpenAI), nunca en el repositorio.

> **Reglas de oro**
> - Staging usa **datos sintéticos**. Nunca copies datos de producción.
> - **Secretos nuevos y distintos** de producción. No reutilices nada de `apps/api/.env.dev-local` (es público en el repo y sus valores son débiles) ni de `apps/api/scripts/seed-dev.ts` (contraseña fija en un repo público).
> - Todo lo de staging lleva el sufijo `staging` para no confundirlo con producción.

## 0. Arquitectura

```
Netlify (rama "staging", branch deploy)        Render (servicio gratuito)        Atlas M0 (proyecto aparte)
https://staging--reclutamiento-asommmn.netlify.app ──► https://<api-staging>.onrender.com ──► asommmn_staging
        │                                                   ├──► S3: bucket asommmn-reclutamiento-staging
        └─ banda "STAGING" y noindex                        └──► OpenAI: proyecto con tope de gasto
```

- **Un solo origen estable de staging** (no uno por PR): así `CORS_ORIGIN` es una lista exacta, sin comodines.
- Nombres sugeridos (cámbialos si quieres, pero sé consistente): proyecto Atlas `asommmn-staging`, base `asommmn_staging`, usuario de base `staging_app`, bucket `asommmn-reclutamiento-staging`, usuario IAM `asommmn-staging-app`, servicio Render `asommmn-api-staging`.

## 1. MongoDB Atlas

1. En Atlas crea un **proyecto nuevo** `asommmn-staging` (un proyecto aparte te permite otro cluster gratuito M0 y aísla permisos).
2. *Create* → cluster **M0 (gratuito)**, región cercana a la de Render. Nombre `staging`.
3. *Database Access* → *Add New Database User*: autenticación por contraseña (genérala larga y aleatoria), usuario `staging_app`. Privilegio: **solo lectura y escritura sobre la base `asommmn_staging`** (rol integrado `readWrite` limitado a esa base; no uses `Atlas admin`).
4. *Network Access* → *Add IP Address*. En el plan gratuito Render no tiene IP de salida fija, así que lo práctico es permitir `0.0.0.0/0`. Es aceptable **solo porque** la base contiene datos sintéticos y el usuario es exclusivo y de contraseña fuerte. Si prefieres más estricto, usa los rangos de IP de salida que Render publica para tu región (en la documentación y en el panel del servicio) y confirma que la conexión funciona.
5. *Connect* → *Drivers* → copia la cadena `mongodb+srv://…` y **agrega el nombre de la base** antes del `?`:
   `mongodb+srv://staging_app:<contraseña>@<cluster>.mongodb.net/asommmn_staging?retryWrites=true&w=majority`
   Esa cadena va en `MONGODB_URI` (Render). No hay que cargar datos: las colecciones y los índices se crean al arrancar, y el administrador inicial sale de las variables `ADMIN_*` (sección 4).

## 2. Amazon S3

1. *S3* → *Create bucket*: nombre `asommmn-reclutamiento-staging`, **la misma región** que usarás en `AWS_REGION` (hoy `us-east-2`).
   - *Object Ownership*: ACLs deshabilitadas (*Bucket owner enforced*).
   - **Block all public access: activado (las 4 casillas).** Los archivos se sirven solo con URLs firmadas de corta duración.
   - Cifrado por defecto: SSE-S3. Versionado: desactivado.
2. *Management* → *Lifecycle rules* → regla `expirar-30-dias` sobre todo el bucket: **expirar objetos actuales a los 30 días** y abortar cargas multipart incompletas a los 7. (Así lo que se suba en pruebas no se acumula.)
3. *IAM* → usuario `asommmn-staging-app`, **solo acceso programático** (sin consola), con esta política (la API solo usa `PutObject`, `GetObject` y `DeleteObject`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ObjetosDelBucketDeStaging",
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::asommmn-reclutamiento-staging/*"
       }
     ]
   }
   ```
   Opcional: agregar `s3:ListBucket` sobre `arn:aws:s3:::asommmn-reclutamiento-staging` para que un archivo inexistente dé 404 en lugar de 403 (la API lo trata como "no encontrado" en ambos casos).
4. Crea una *access key* para ese usuario y guárdala solo en Render (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).
5. **CORS del bucket: no hace falta.** El navegador nunca llama a S3 con `fetch`/XHR (la web no tiene ningún `fetch`; solo incrusta URLs firmadas en `<img>` y `<iframe>`, y las subidas pasan por la API). Déjalo sin configuración de CORS (mínimo privilegio). Si en el futuro una función necesitara leer S3 directo desde el navegador, usa solo el origen de staging:

   ```json
   [{ "AllowedMethods": ["GET", "HEAD"], "AllowedOrigins": ["https://staging--reclutamiento-asommmn.netlify.app"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3000 }]
   ```
6. El host del bucket (`asommmn-reclutamiento-staging.s3.<región>.amazonaws.com`) va en Netlify como `NEXT_PUBLIC_S3_HOST` (sección 5): la CSP de la web lo usa para permitir las vistas previas.

## 3. OpenAI

1. En platform.openai.com → *Projects* → crea el proyecto `asommmn-staging`.
2. En los límites del proyecto fija un **tope de gasto mensual** (sugerido: 10 USD) y, si el panel lo permite, restringe los modelos a los que usa la app: los de `OPENAI_MODEL` y `OPENAI_MODEL_DOCS` (snapshots fechados, como en `.env.example`).
3. Crea una **llave del proyecto** (no una llave personal) y guárdala solo en Render como `OPENAI_API_KEY`.
4. Si prefieres **cero gasto**, deja `OPENAI_API_KEY` vacía: la extracción con IA responde `iaDisponible=false` y el resto de la app funciona; solo no podrás probar la lectura de documentos.

(Los nombres exactos de los menús pueden variar; lo importante es: proyecto aparte, llave del proyecto y tope de gasto.)

## 4. Render — servicio de la API (plan gratuito)

Antes de crear el servicio, sube la rama `staging` (sección 6) para que exista.

1. *New* → *Web Service* → repositorio `ASOMMMN/Aplicacion-Web-ASOMMMN` → **Branch: `staging`**. Nombre `asommmn-api-staging`, región la misma de producción, *Instance type*: **Free**.
2. *Root Directory*: **vacío** (raíz del repo; es un monorepo con workspaces).
3. *Build Command*:
   ```
   npm ci --include=dev && npm run build:api
   ```
   (`--include=dev` asegura que se instale `@nestjs/cli` aunque `NODE_ENV=production` esté definida durante el build.)
4. *Start Command*:
   ```
   npm --workspace=apps/api run start:prod
   ```
5. *Health Check Path*: `/health` (responde 200 si Mongo contesta; no requiere sesión).
6. *Auto-Deploy*: sí (cada `git push … :staging` redespliega).
7. **Versión de Node: pendiente de confirmar** (ver sección 9). Usa la misma que producción; si Render la toma de una variable `NODE_VERSION`, defínela con ese valor. El repositorio no la fija (no hay `engines`, `.nvmrc` ni `render.yaml`).

### Variables de entorno del servicio (sin valores)

| Variable | ¿Va? | Qué poner |
|---|---|---|
| `NODE_ENV` | sí | `production` (valor fijo: activa cookies `SameSite=None; Secure`, CORS estricto y apaga Swagger) |
| `PORT` | **no definir** | Render la inyecta |
| `MONGODB_URI` | sí | Cadena de Atlas de staging **con** el nombre de la base (sección 1). Secreto |
| `JWT_SECRET` | sí | **Nuevo**, aleatorio, ≥ 48 caracteres. Secreto, distinto de producción |
| `JWT_EXPIRES_IN` | sí | Igual que producción (`15m`) |
| `JWT_REFRESH_SECRET` | sí | **Nuevo**, aleatorio (hoy sin efecto, pero no lo dejes vacío) |
| `JWT_REFRESH_EXPIRES_IN` | sí | Igual que producción (`7d`) |
| `CORS_ORIGIN` | **sí, obligatoria** | Solo `https://staging--reclutamiento-asommmn.netlify.app` (sin barra final ni comodines). Si falta o es inválida la API **no arranca** |
| `FRONTEND_URL` | sí | La misma URL de staging (se usa en los enlaces de los correos) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | sí | Del usuario IAM de staging (sección 2). Secretos |
| `AWS_REGION` | sí | La del bucket (`us-east-2`) |
| `AWS_S3_BUCKET` | sí | `asommmn-reclutamiento-staging` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | sí | **Ficticias y no vacías** (p. ej. `staging-ficticio`): ya no se usan, pero la API no arranca si faltan |
| `RESEND_API_KEY`, `RESEND_FROM` | **vacías o sin definir** | Así la API **no envía ningún correo** |
| `EMAIL_ALLOWLIST` | opcional | Solo si algún día activas Resend en staging: lista de correos o dominios permitidos (sin comodines). Vacía = sin restricción |
| `EMAIL_VERIFICATION_REQUIRED` | sí | `false` (sin correo no se puede verificar) |
| `OPENAI_API_KEY` | opcional | Llave del proyecto de staging (sección 3) o vacía (IA apagada) |
| `OPENAI_MODEL`, `OPENAI_MODEL_DOCS`, `OPENAI_SEED` | sí | Igual que producción (snapshots fechados) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`, `ADMIN_APELLIDOS` | sí | El administrador inicial de staging. ⚠️ **Define siempre `ADMIN_PASSWORD` con una contraseña fuerte**: si falta, el código usa una contraseña por defecto conocida. Se crea solo si no existe ningún administrador |
| `STORAGE_PATH`, `BACKEND_PUBLIC_URL`, `IA_DOCS_*` | omitir | Valores por defecto (disco efímero; los archivos nuevos van a S3) |
| `ENABLE_TEST_ENDPOINTS` | **NO definir** | Además solo funcionaría con `NODE_ENV=development` |
| `SOC_MODE` | **NO definir** | Es del tablero de desarrollo |
| `ENV_FILE` | **NO definir** | Solo para desarrollo local |

Para generar un secreto aleatorio: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

**Plan gratuito de Render:** el servicio se duerme tras ~15 minutos sin tráfico y la primera petición tarda (arranque en frío). Antes de probar la web, "despierta" la API con `curl https://<tu-servicio>.onrender.com/health`. Como staging no envía correo, el bloqueo de SMTP del plan gratuito no importa (los correos usan la API HTTPS de Resend). Las tareas programadas (vencimientos de cursos y aviso semanal) corren sobre la base de staging y, sin llave de correo, no envían nada; con el servicio dormido simplemente no corren.

## 5. Netlify

1. *Site configuration* → *Build & deploy* → *Branches and deploy contexts*:
   - Production branch: `main` (sin cambios).
   - *Branch deploys*: **"Let me add individual branches"** → agrega `staging`. Su URL será `https://staging--reclutamiento-asommmn.netlify.app`.
2. *Site configuration* → *Environment variables*. Para cada variable usa **un valor distinto por contexto** (*Different value for each deploy context*):

   | Variable | Production | Deploy previews y Branch deploys |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | la URL actual de la API de producción | `https://<tu-servicio-staging>.onrender.com` (sin barra final) |
   | `NEXT_PUBLIC_S3_HOST` | el host del bucket de producción | `asommmn-reclutamiento-staging.s3.<región>.amazonaws.com` |
   | `NEXT_PUBLIC_ENTORNO` | **no definir en Production** | `staging` |
   | `NODE_VERSION` | pendiente (sección 9) | igual que Production |

   - **Cada variable debe incluir el alcance de Deploy previews y Branch deploys.** Si `NEXT_PUBLIC_API_URL` solo existe para Production, el build del preview falla en segundos con "NEXT_PUBLIC_API_URL no está configurada" (`next.config.ts` lo exige).
   - Las variables `NEXT_PUBLIC_*` se incrustan **al compilar**: si las cambias, vuelve a desplegar (*Clear cache and deploy site*).
3. **No modifiques `apps/web/netlify.toml`.** Tiene una CSP que Netlify aplica a los archivos estáticos (`/_next/static/**`); las páginas reciben la CSP de `next.config.ts`, que sí sale de las variables anteriores (por eso el preview puede apuntar a otra API sin tocar nada). Borrar la de `netlify.toml` dejaría los estáticos **sin CSP**.
4. Con `NEXT_PUBLIC_ENTORNO=staging` la web muestra una banda **STAGING**, antepone `[STAGING]` al título y envía `X-Robots-Tag: noindex, nofollow` (no indexable). En producción nada de eso aparece ni cambia el bundle.
5. Comprueba tras el primer despliegue:
   ```
   curl -I https://staging--reclutamiento-asommmn.netlify.app/login
   ```
   Debe verse `x-robots-tag: noindex, nofollow` y una `content-security-policy` cuyo `connect-src` apunta a la API de **staging**.
6. Los *branch deploys* y *deploy previews* consumen minutos o créditos de build del plan: revisa el consumo.

## 6. Llevar una rama a staging

```
git push origin <rama>:staging
```
Render y Netlify despliegan solos desde `staging`. Para probar todo el trabajo pendiente basta con `feat/staging-listo` (incluye la pila completa). Si `staging` quedó en otro punto y Git rechaza el push (no avance rápido), como `staging` es descartable puedes usar:
```
git push --force-with-lease origin <rama>:staging
```
**Nunca** fuerces `main`.

## 7. Qué cambió en el código para staging

- `CORS_ORIGIN` es una **lista de orígenes exactos** separados por comas (`https://host[:puerto]`, sin comodines, rutas ni barra final). En producción es **obligatoria** y, si falta o es inválida, la API no arranca y dice por qué. Ya no hay valor por defecto.
- `EMAIL_ALLOWLIST` (opcional): si se define, solo se envía correo a esos correos o dominios.
- `NEXT_PUBLIC_ENTORNO=staging`: banda STAGING, título y `noindex`.
- Escáner: se ignoran **Repetir** y **Agregar página** durante ~500 ms tras entrar a la revisión (posible causa del regreso a captura tras **Continuar**). El diagnóstico `[escaner-diag]` sigue activo hasta que termines tus pruebas en celular.

## 8. Orden de merge de los PR apilados

| PR | Rama | Base |
|---|---|---|
| #1 | `feat/escaner-subidas` | `main` |
| #2 | `chore/deps-seguridad-api` | `feat/escaner-subidas` |
| #3 | `chore/deps-next` | `chore/deps-seguridad-api` |
| #4 | `feat/staging-listo` | `chore/deps-next` |

1. **Antes de empezar:** termina la prueba en staging (sección 10) y resuelve los pendientes de la sección 9.
2. Mergea **en orden #1 → #2 → #3 → #4**, siempre con **"Create a merge commit"** (no *squash* ni *rebase*). Así los commits conservan su identidad y cada PR hijo, al cambiar su base a `main`, muestra solo sus propios cambios. Si borras la rama del PR padre al mergearlo, GitHub cambia solo la base del hijo a `main`; si no, cámbiala a mano antes de mergear el hijo.
3. Cada merge a `main` despliega producción (Netlify y, si lo tienes así, Render). Entre merges revisa que producción siga bien (`/login`, un inicio de sesión de prueba, CSP).
4. **#3** sube `next` a 16.4.3 y `sharp` a 0.35.5: antes confirma que Netlify usa Node ≥ 20.9.
5. **#4** hace obligatoria `CORS_ORIGIN`: antes de mergearlo (y de que Render despliegue la API) **confirma que `CORS_ORIGIN` está definida en el servicio de producción de Render** y que cumple el formato (`https://reclutamiento-asommmn.netlify.app`, sin barra final). Si no, la API de producción **no arrancará**.
6. Si por error haces *squash* de un PR padre, el hijo vuelve a incluir los commits originales del padre. Se corrige reubicándolo (ejemplo tras hacer squash de #1):
   ```
   git fetch origin
   git rebase --onto origin/main feat/escaner-subidas chore/deps-seguridad-api
   git push --force-with-lease origin chore/deps-seguridad-api
   ```
   y se repite con cada hijo (`--onto <nueva base> <tip viejo del padre> <hijo>`).

## 9. Pendientes tuyos antes de producción

- **Versión de Node en Render y Netlify:** el repositorio no la define (no hay `engines`, `.nvmrc`, `render.yaml` ni `NODE_VERSION` en `netlify.toml`), así que **no se agregó nada** para no inventarla. Confírmala en ambos paneles (Netlify: *Site configuration → Build & deploy → Environment*; Render: *Environment* del servicio). `next` 16.4 y `sharp` 0.35 exigen **Node ≥ 20.9**. Cuando la tengas, conviene fijarla (`engines` + `.nvmrc`) y usar la misma en staging.
- **`CORS_ORIGIN` en el servicio de producción de Render** (ver punto 5 de la sección 8).
- Log del deploy fallido de Netlify del PR #1: probablemente falta `NEXT_PUBLIC_API_URL` en el alcance de *Deploy previews* (ver sección 5).

## 10. Lista de pruebas manuales (consolidada)

Marca cada casilla en staging, en este orden. Datos sintéticos siempre.

**A. Entorno**
- [ ] `curl https://<api-staging>.onrender.com/health` responde 200 (tras el arranque en frío).
- [ ] La web muestra la banda **STAGING** y el título empieza con `[STAGING]`.
- [ ] `curl -I` de la web trae `x-robots-tag: noindex, nofollow`.
- [ ] En el log de Netlify: la versión de Node (≥ 20.9) y el build termina. En el de Render: arranque limpio, sin error de `CORS_ORIGIN`.

**B. Sesión por rol**
- [ ] Postulante: registro (sin correo de verificación), inicio y cierre de sesión; cae en su inicio.
- [ ] Administrador (el de `ADMIN_*`): inicia sesión; crea un evaluador; el evaluador inicia sesión y cae en su inicio.
- [ ] Cada rol, al abrir una ruta de otro rol (p. ej. el postulante en `/candidatos`), es redirigido a su inicio.
- [ ] La sesión se renueva (deja la pestaña abierta más de 15 min y vuelve a usarla).
- [ ] La cookie de renovación es `HttpOnly`, `Secure` y `SameSite=None` (DevTools → Application → Cookies, en el dominio de la API).

**C. Subidas (CV, documentos personales, cursos, Mi nube, archivos del evaluador)**
- [ ] Un PDF, un JPG y un PNG válidos suben bien en cada punto.
- [ ] **Archivo falso:** un `.exe` o un `.txt` renombrado a `.pdf` (o `.jpg`) se rechaza con mensaje de tipo no permitido.
- [ ] **Sobre el límite** (la API responde 413 y la web muestra el límite): 20 MB en CV, documentos personales y cursos; 50 MB en archivos del evaluador; 100 MB en Mi nube. Crea archivos de relleno:
  - Windows: `fsutil file createnew relleno-21MB.pdf 22020096` (51 MB = `53477376`; 101 MB = `105906176`)
  - macOS/Linux: `head -c 22020096 /dev/zero > relleno-21MB.pdf`
- [ ] El certificado de un curso se analiza con IA (si hay llave) y se guarda; el documento aparece en la lista.

**D. Arrastrar y soltar** (Mi CV, Mis cursos, Documentos personales, Mi nube, Archivos del evaluador)
- [ ] Un PDF válido: se resalta sin parpadear y sube.
- [ ] Suelta un `.exe`, un archivo sobre el límite, una **carpeta** y dos archivos donde cabe uno: cada uno muestra su mensaje y no sube nada.
- [ ] Suelta un archivo fuera de cualquier zona: el navegador no lo abre ni cambia de página.
- [ ] Con una subida en curso, suelta otro: "Espera a que termine la subida actual."

**E. Escáner en celular real** (iPhone/Safari y Android/Chrome; detalle en `docs/escaner-pruebas-manuales.md`)
- [ ] INE frente y reverso → un PDF de 2 páginas que sube y se lee.
- [ ] **Arreglo del doble toque:** toca **Continuar** una vez y luego **dos veces rápido**: nunca debe regresar a la pantalla de captura.
- [ ] Si regresa a captura: conecta el celular (Chrome: `chrome://inspect`; Safari: Inspector web) y copia `window.__escanerDiag`; anota qué botón se tocó y a cuántos ms.
- [ ] En la pestaña de red, el código del escáner **no** se descarga hasta abrirlo.
- [ ] Abrir y cerrar el escáner 5 veces con fotos no congela ni recarga la pestaña.

**F. Formularios**
- [ ] Registro: cada regla de contraseña muestra su mensaje (corta, sin mayúscula, sin minúscula, sin número) y la confirmación distinta marca el campo correcto.
- [ ] Inicio de sesión con datos inválidos; cambiar contraseña; Mi perfil.
- [ ] Recuperar y restablecer contraseña: **no aplica** en staging sin correo (confirma que no llega ninguno).

**G. Vistas previas de documentos**
- [ ] Un PDF se ve en el visor (iframe) y una imagen se ve; la descarga funciona.
- [ ] La consola del navegador no muestra errores de CSP (`Refused to …`).

**H. Panel del evaluador**
- [ ] Tabla de candidatos, filtros, orden, indicadores clicables y presets; exportar CSV.
- [ ] Papelera y filtros por origen (administrador); comentarios.

**I. Chatbot y topes (429)**
- [ ] El chatbot responde (con llave de OpenAI) y mantiene la conversación.
- [ ] Topes por usuario: al pasarse, la API responde 429 con mensaje en español — chatbot 30 mensajes cada 10 min; CV 20 subidas/hora; lectura de cursos 30/hora; documentos personales 20 y 30/hora. Para los de subida y lectura de archivos, repite la acción con un archivo inválido de 1 KB: el tope cuenta la petición y el servicio lo rechaza por tipo sin gastar IA (compruébalo en el primer intento). El del chatbot sí consume ~30 mensajes de un modelo mini (centavos).

**J. Correo**
- [ ] No llega ningún correo (con `RESEND_*` vacías). Si activaste Resend con `EMAIL_ALLOWLIST`, llega solo a los permitidos.

**K. Cabeceras**
- [ ] `curl -I` de `/login`: `content-security-policy` con `connect-src` de la API de staging, HSTS, `x-frame-options`/`frame-ancestors`, `x-content-type-options`.
- [ ] La API: `curl -I` con `Origin: https://staging--reclutamiento-asommmn.netlify.app` devuelve `access-control-allow-origin` con ese origen; con otro origen, no.

**L. Después de los merges, en producción**
- [ ] `/login` responde y muestra la CSP; un inicio de sesión de prueba funciona; no hay banda STAGING ni `x-robots-tag`.
- [ ] La API de producción arrancó (se confirmó `CORS_ORIGIN` antes del merge #4).
