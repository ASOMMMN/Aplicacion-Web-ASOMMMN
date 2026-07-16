# Checklist pre-producción — ASOMMMN

Completa esta lista **antes de hacer deploy**. Cada ítem indica dónde cambiar el valor y por qué.

---

## 1. Credenciales de MongoDB Atlas

| Variable | Archivo | Acción |
|---|---|---|
| `MONGODB_URI` | `apps/api/.env` | Cambia la contraseña `1234` en la cadena de conexión por una segura. Hazlo desde el panel de Atlas → Database Access. |

✅ Se lee de variable de entorno (`ConfigService` → `MONGODB_URI`). No está hardcodeada.

---

## 2. Credenciales de MinIO

| Variable | Archivo | Acción |
|---|---|---|
| `MINIO_ACCESS_KEY` | `apps/api/.env` | Cambia `minioadmin` por la clave real de tu MinIO de producción. |
| `MINIO_SECRET_KEY` | `apps/api/.env` | Cambia `minioadmin123` por el secreto real. |
| `MINIO_ENDPOINT` | `apps/api/.env` | Apunta al host/IP de tu MinIO de producción (no `localhost`). |
| `MINIO_USE_SSL` | `apps/api/.env` | Cambia a `true` si tu MinIO está detrás de HTTPS. |

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

## 5. Resend (correo transaccional)

| Variable | Archivo | Acción |
|---|---|---|
| `RESEND_API_KEY` | `apps/api/.env` | API key real de tu cuenta de Resend (https://resend.com/api-keys). |

✅ Se lee de variables de entorno.
> Si `RESEND_API_KEY` falta, el servicio de notificaciones no envía correos: registra un error claro en el log al arrancar y en cada intento de envío, pero no impide que el servidor arranque.
> El remitente por defecto es `ASOMMMN <onboarding@resend.dev>` (dominio de pruebas de Resend). En modo de pruebas, Resend solo entrega correos a la dirección con la que te registraste. Cuando se verifique un dominio propio en Resend, actualizar el remitente en `notificaciones.service.ts` (constante `FROM_DEFAULT`).

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
- [ ] Revisar que MinIO no esté expuesto públicamente; solo el backend debe poder acceder a él.

---

## Resumen rápido

| # | Ítem | Estado antes de deploy |
|---|---|---|
| 1 | Contraseña MongoDB Atlas | 🔴 Cambiar |
| 2 | Credenciales MinIO | 🔴 Cambiar |
| 3 | Contraseña admin seed | 🔴 Cambiar |
| 4 | Secretos JWT | 🔴 Generar nuevos |
| 5 | SMTP real | 🔴 Configurar |
| 6 | Dominio en CORS (`main.ts`) | 🟡 Hardcodeado — cambiar o mover a env var |
| 7 | `NODE_ENV=production` | 🔴 Cambiar |
| 8 | `NEXT_PUBLIC_API_URL` | 🔴 Configurar |
| 9 | Endpoint test-verificar-email | 🟡 Opcional — eliminar |
