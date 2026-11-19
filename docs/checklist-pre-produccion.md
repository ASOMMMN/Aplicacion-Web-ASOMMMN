# Checklist pre-producción — ASOMMMN

Completa esta lista **antes de hacer deploy**. Cada ítem indica dónde cambiar el valor y por qué.

---

## 1. Credenciales de MongoDB Atlas

| Variable | Archivo | Acción |
|---|---|---|
| `MONGODB_URI` | `apps/api/.env` | Cambia la contraseña `1234` en la cadena de conexión por una segura. Hazlo desde el panel de Atlas → Database Access. |

✅ Se lee de variable de entorno (`ConfigService` → `MONGODB_URI`). No está hardcodeada.

---

## 2. Credenciales de S3 (Amazon)

| Variable | Archivo | Acción |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | `apps/api/.env` (en producción, Render → Environment) | Usa un usuario IAM propio de la aplicación, con permisos solo sobre el bucket (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket`). Nunca la clave de la cuenta raíz. |
| `AWS_SECRET_ACCESS_KEY` | `apps/api/.env` | Secreto de ese usuario IAM. Si se filtró, rótalo desde IAM. |
| `AWS_REGION` | `apps/api/.env` | Región del bucket de producción (por defecto `us-east-2`). |
| `AWS_S3_BUCKET` | `apps/api/.env` | Nombre del bucket de producción (no el de desarrollo). |
| `NEXT_PUBLIC_S3_HOST` | `apps/web/.env.local` (en producción, Netlify) | Host exacto del bucket, para la CSP (`img-src`/`frame-src`) de las vistas previas. Sin comodines. |

✅ Todas se leen de variables de entorno.

---

## 3. Contraseña del administrador inicial (seed)

| Variable | Archivo | Acción |
|---|---|---|
| `ADMIN_EMAIL` | `apps/api/.env` | Cambia a la dirección real del administrador. |
| `ADMIN_PASSWORD` | `apps/api/.env` | Cambia `Admin123!` por una contraseña segura y única. |

✅ Se leen de variables de entorno.
> El seed solo crea el usuario si no existe ningún admin en la BD; una vez en producción, puedes eliminar estas variables del `.env`.

---

## 4. Secretos JWT

| Variable | Archivo | Acción |
|---|---|---|
| `JWT_SECRET` | `apps/api/.env` | Genera una cadena aleatoria de 64+ caracteres. Ejemplo: `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | `apps/api/.env` | Idem — debe ser **diferente** al `JWT_SECRET`. |

✅ Se leen de variables de entorno.
> Si cambias estos secretos en producción, todas las sesiones activas quedarán invalidadas (comportamiento esperado).

---

## 5. Resend (correo transaccional, vía API HTTPS)

| Variable | Archivo | Acción |
|---|---|---|
| `RESEND_API_KEY` | `apps/api/.env` | API key real de tu cuenta de Resend (https://resend.com/api-keys). |
| `RESEND_FROM` | `apps/api/.env` | Dirección de un dominio verificado en https://resend.com/domains (ej. `notificaciones@tudominio.com`). |

✅ Se usa el SDK oficial (`resend`, método `emails.send()`), **no SMTP** — necesario porque el plan Free de Render bloquea el tráfico saliente en los puertos SMTP (25, 465, 587); la API HTTPS de Resend usa el puerto 443.
> Si `RESEND_API_KEY` o `RESEND_FROM` faltan, el servicio de notificaciones no envía correos: registra un error claro en el log al arrancar y no intenta llamar a la API, pero no impide que el servidor arranque.
> Si `RESEND_FROM` no pertenece a un dominio verificado en Resend, la API rechaza el envío (`error.statusCode`/`error.message` quedan logueados en cada intento fallido).

---

## 6. Dominio en CORS

| Archivo | Línea | Acción |
|---|---|---|
| `apps/api/src/main.ts` | ~35 | Cambia `'https://asommmn.example.com'` por el dominio real de tu frontend. |

⚠️ **Este valor está hardcodeado** en `main.ts`. No viene de variable de entorno.
**Recomendación:** mover a una variable de entorno `CORS_ORIGIN` antes del deploy:
```typescript
// En main.ts:
origin: isProduction
  ? config.get<string>('CORS_ORIGIN', 'https://asommmn.example.com').split(',')
  : ['http://localhost:3000', 'http://localhost:3002'],
```

---

## 7. NODE_ENV = production

| Variable | Archivo | Acción |
|---|---|---|
| `NODE_ENV` | `apps/api/.env` | Cambia `development` → `production`. |

Efectos al cambiar a `production`:
- Swagger UI (`/api-docs`) queda **deshabilitado** (ya implementado en `main.ts`).
- Cookies de refresh token se marcan como `Secure` (solo HTTPS).
- CORS permite solo el dominio de producción.

---

## 8. Variables de entorno del frontend

| Variable | Archivo | Acción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` (crear) | URL de la API en producción, ej. `https://api.tudominio.com`. |

> Verifica que `apps/web/src/lib/api/client.ts` lea esta variable para la URL base del cliente HTTP.

---

## 9. Seguridad adicional antes de producción

- [ ] Eliminar el endpoint `GET /auth/test-verificar-email` (en `apps/api/src/modules/auth/auth.controller.ts`) — ya tiene guarda por `NODE_ENV`, pero es preferible removerlo.
- [ ] Confirmar que `.env` y `.env.local` estén en `.gitignore` (ya están).
- [ ] Rotar los refresh tokens existentes en BD si se cambiaron los secretos JWT.
- [ ] Configurar HTTPS en el servidor (certificado TLS).
- [ ] Revisar que el bucket S3 no sea público (Block Public Access activado): los archivos se sirven solo con URLs firmadas de corta duración.

---

## Resumen rápido

| # | Ítem | Estado antes de deploy |
|---|---|---|
| 1 | Contraseña MongoDB Atlas | 🔴 Cambiar |
| 2 | Credenciales S3 (AWS) | 🔴 Cambiar |
| 3 | Contraseña admin seed | 🔴 Cambiar |
| 4 | Secretos JWT | 🔴 Generar nuevos |
| 5 | `RESEND_API_KEY` / `RESEND_FROM` (dominio verificado) | 🔴 Configurar |
| 6 | Dominio en CORS (`main.ts`) | 🟡 Hardcodeado — cambiar o mover a env var |
| 7 | `NODE_ENV=production` | 🔴 Cambiar |
| 8 | `NEXT_PUBLIC_API_URL` | 🔴 Configurar |
| 9 | Endpoint test-verificar-email | 🟡 Opcional — eliminar |
