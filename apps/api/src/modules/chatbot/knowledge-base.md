# BASE DE CONOCIMIENTO — PORTAL DEL POSTULANTE
## Sistema de Evaluación Curricular — Escuela Náutica Mercante de Veracruz (ENMV)

> **Uso interno:** Este archivo es el contexto de referencia para el chatbot de ayuda
> del portal del postulante de ENMV. Cubre únicamente el rol **postulante**.
> Los roles evaluador y administrador se documentarán por separado.
> Última revisión: 2026-07-01

---

## ÍNDICE

1. [Registro de cuenta nueva](#1-registro-de-cuenta-nueva)
2. [Inicio de sesión (Login)](#2-inicio-de-sesión-login)
3. [Recuperar contraseña](#3-recuperar-contraseña)
4. [Restablecer contraseña desde enlace de correo](#4-restablecer-contraseña-desde-enlace-de-correo)
5. [Cambio obligatorio de contraseña](#5-cambio-obligatorio-de-contraseña)
6. [Cerrar sesión](#6-cerrar-sesión)
7. [Dashboard (Pantalla de inicio)](#7-dashboard-pantalla-de-inicio)
8. [Mi Perfil](#8-mi-perfil)
9. [Mi CV](#9-mi-cv)
10. [Mis Cursos y Certificaciones](#10-mis-cursos-y-certificaciones)
11. [Documentos Personales](#11-documentos-personales)
12. [Mi Nube Documental](#12-mi-nube-documental)
13. [Estado de la Postulación](#13-estado-de-la-postulación)
14. [Expediente Completo y Finalizar Postulación](#14-expediente-completo-y-finalizar-postulación)
15. [PREGUNTAS FRECUENTES](#15-preguntas-frecuentes)

---

## 1. REGISTRO DE CUENTA NUEVA

**Nombre de la función:** Registro de postulante  
**Ruta / pantalla:** `/registro`  
**Acceso:** Desde la pantalla de login → enlace "Regístrate"

### ¿Qué es?
La pantalla donde creas tu cuenta por primera vez en el portal.

### Pasos para registrarse
1. Ve a `/login` y haz clic en **"Regístrate"** (enlace en la parte inferior de la tarjeta).
2. Rellena todos los campos del formulario:
   - **Nombre(s)**: tu nombre de pila, entre 2 y 50 caracteres. Ejemplo: "Juan Carlos".
   - **Apellidos**: tus apellidos completos, entre 2 y 100 caracteres. Ejemplo: "Pérez Ramírez".
   - **Correo electrónico**: una dirección de email válida que uses regularmente. Con este correo iniciarás sesión siempre.
   - **Contraseña**: crea una contraseña segura (ver requisitos abajo).
   - **Confirmar contraseña**: escribe exactamente la misma contraseña del campo anterior.
3. Haz clic en **"Registrarme"**.
4. Si todo es correcto verás el mensaje: _"¡Cuenta creada! Puedes iniciar sesión de inmediato."_
5. Serás redirigido al login. Ingresa con tu correo y contraseña.

> **Nota importante:** Tu cuenta se activa de inmediato al registrarte. **No necesitas verificar tu correo** para poder entrar al sistema.

### Requisitos de la contraseña (registro)
- Mínimo **8 caracteres**
- Al menos **una letra** y **un número**

### Errores comunes al registrarse

| Situación | Mensaje que verás |
|---|---|
| Las contraseñas no coinciden | "Las contraseñas no coinciden" |
| Contraseña muy corta | "Mínimo 8 caracteres" |
| Nombre muy corto | "Mínimo 2 caracteres" |
| Apellidos muy cortos | "Mínimo 2 caracteres" |
| Correo ya registrado | "Este correo ya está en uso" |
| Formato de correo incorrecto | "Email inválido" |

---

## 2. INICIO DE SESIÓN (LOGIN)

**Nombre de la función:** Inicio de sesión  
**Ruta / pantalla:** `/login`

### ¿Qué es?
La pantalla principal del portal. Desde aquí entras a tu cuenta usando tu correo y contraseña.

### Pasos para iniciar sesión
1. Ve al portal (te llevará a `/login` automáticamente si no has iniciado sesión).
2. Escribe tu **correo electrónico** en el campo correspondiente.
3. Escribe tu **contraseña**.
4. Haz clic en **"Iniciar sesión"**.
5. Si tus datos son correctos, el sistema te llevará a tu **Dashboard** automáticamente.

### Situaciones especiales al iniciar sesión

- **El sistema me pide cambiar mi contraseña antes de entrar:** El administrador creó tu cuenta con una contraseña temporal. Debes cambiarla antes de continuar (ver sección 5).
- **El sistema me pide un código de autenticación (MFA):** Tu cuenta tiene doble factor activado. Abre tu aplicación de autenticación e ingresa el código de 6 dígitos que muestra.

### Errores comunes al iniciar sesión

| Situación | Qué hacer |
|---|---|
| "Credenciales inválidas" o "Usuario no encontrado" | Verifica que el correo y contraseña sean correctos. Comprueba que no tengas el Bloq Mayús activado. Si no recuerdas tu contraseña, usa "¿Olvidaste tu contraseña?" |
| "Demasiados intentos, intenta más tarde" | El sistema bloqueó temporalmente el acceso por múltiples intentos fallidos. Espera unos minutos antes de intentar de nuevo. |

### Olvidé mi contraseña
Haz clic en el enlace **"¿Olvidaste tu contraseña?"** que aparece junto al campo de contraseña. Ve a la sección 3 de este manual.

### ¿No tengo cuenta?
Haz clic en **"Regístrate"** al final de la tarjeta de login. Ve a la sección 1 de este manual.

---

## 3. RECUPERAR CONTRASEÑA

**Nombre de la función:** Recuperación de contraseña  
**Ruta / pantalla:** `/recuperar-contrasena`  
**Acceso:** Desde login → enlace "¿Olvidaste tu contraseña?"

### ¿Qué es?
Sirve para recuperar el acceso a tu cuenta cuando olvidaste tu contraseña. En vez de un enlace, el sistema te envía por correo una **contraseña temporal nueva** que reemplaza a la anterior.

### Pasos para recuperar tu contraseña
1. En la pantalla de login, haz clic en **"¿Olvidaste tu contraseña?"**.
2. Escribe el **correo electrónico** con el que te registraste.
3. Haz clic en **"Enviar contraseña temporal"**.
4. Verás el mensaje: _"Si el correo está registrado, recibirás una contraseña temporal en breve. Revisa también tu carpeta de spam."_
5. Revisa tu bandeja de entrada (y la carpeta de spam). Recibirás un correo con tu nueva contraseña temporal.
6. Ve a la pantalla de login e inicia sesión con esa contraseña temporal. El sistema te pedirá cambiarla de inmediato (ver sección 5, "Cambio obligatorio de contraseña").

> **Nota de seguridad:** El sistema siempre muestra el mismo mensaje, aunque el correo no exista en la base de datos. Esto es intencional para proteger la privacidad de los usuarios.

---

## 5. CAMBIO OBLIGATORIO DE CONTRASEÑA

**Nombre de la función:** Cambio de contraseña temporal asignada por el administrador  
**Ruta / pantalla:** `/cambiar-contrasena`  
**Cuándo aparece:** Cuando inicias sesión por primera vez con una contraseña temporal que el administrador te asignó

### ¿Qué es?
Cuando el administrador crea tu cuenta manualmente, te asigna una contraseña temporal. El sistema te obliga a cambiarla antes de poder acceder al portal.

### Pasos para cambiar la contraseña temporal
1. Inicia sesión en `/login` con tus credenciales temporales.
2. El sistema te redirige automáticamente a esta pantalla.
3. Tu correo aparece prellenado. Si está vacío, escríbelo.
4. Escribe la **contraseña temporal** que te dieron.
5. Escribe tu **nueva contraseña** (ver requisitos abajo).
6. Escribe la misma en **"Confirmar nueva contraseña"**.
7. Haz clic en **"Actualizar contraseña"**.
8. Serás redirigido al login para entrar con tu nueva contraseña.

### Requisitos de la nueva contraseña en este flujo
Este flujo tiene requisitos más estrictos que el registro:
- Mínimo **10 caracteres** y máximo **72 caracteres**
- Al menos **una letra minúscula** (a–z)
- Al menos **una letra mayúscula** (A–Z)
- Al menos **un número** (0–9)

Ejemplo de contraseña válida: `Segura2026`

### Errores comunes

| Situación | Mensaje que verás |
|---|---|
| Contraseña temporal incorrecta | "No se pudo cambiar la contraseña" |
| Contraseña muy corta | "Mínimo 10 caracteres" |
| Sin mayúscula | "Debe contener una mayúscula" |
| Sin minúscula | "Debe contener una minúscula" |
| Sin número | "Debe contener un número" |
| Confirmación no coincide | "Las contraseñas no coinciden" |

---

## 6. CERRAR SESIÓN

**Nombre de la función:** Cierre de sesión (Logout)  
**Dónde:** Menú de navegación superior, opción de cierre de sesión

### Pasos
1. En la barra de navegación superior, localiza el botón o enlace de cierre de sesión.
2. Haz clic en él.
3. El sistema cerrará tu sesión de forma segura y te redirigirá al login.

> **Recomendación:** Siempre cierra sesión cuando uses una computadora compartida o pública.

---

## 7. DASHBOARD (PANTALLA DE INICIO)

**Nombre de la función:** Panel de inicio del postulante  
**Ruta / pantalla:** `/dashboard`  
**Acceso:** Automáticamente al iniciar sesión, o desde el menú superior → "Dashboard"

### ¿Qué es?
La pantalla principal después de iniciar sesión. Resume tu estado de postulación en un solo lugar.

### Información que muestra el Dashboard

**a) Encabezado de bienvenida**
- Tu nombre, correo y fecha de registro.
- Botones de acceso rápido: "Editar perfil" y "Gestionar CV".

**b) Barra de progreso del expediente**
- Muestra el **porcentaje de avance** de tu expediente (0% a 100%).
- La barra es dorada-azul mientras avanzas; se vuelve verde al llegar al 100%.
- Debajo de la barra aparece el **checklist** con los 5 requisitos:
  - ✅ = ya cumplido
  - ❌ = pendiente + botón "Ir →" que te lleva directamente a completarlo
- Si tu expediente ya fue enviado, la tarjeta muestra "✅ Expediente enviado" con la fecha.

**c) Tarjeta de Vacante**
- Muestra el puesto al que te postulas (si ya lo llenaste en tu perfil).
- Si aún no lo has definido, esta tarjeta no aparece. Ve a "Mi Perfil" para llenarlo.

**d) Tu CV**
- Si tienes CV: muestra el nombre, versión, tamaño y fecha de subida.
- Si no tienes CV: aparece un aviso con el botón "Cargar CV".

**e) Comentarios del evaluador**
- Si el evaluador dejó comentarios, aparecen aquí con nombre, fecha, estado sugerido y calificación.
- Si no hay comentarios: _"Los comentarios aparecerán aquí cuando el evaluador revise tu expediente."_

**f) Botón "🚀 Finalizar postulación"**
- Solo visible cuando el expediente NO está enviado.
- Está deshabilitado (gris) mientras el porcentaje sea menor a 100%.
- Se activa en azul cuando alcanzas el 100%.
- Muestra cuántos requisitos faltan: _"Faltan X requisitos."_

### Navegación disponible desde el menú superior
- Dashboard
- Mi Perfil
- Mi CV
- Mis cursos
- Docs personales
- Estado

---

## 8. MI PERFIL

**Nombre de la función:** Edición del perfil personal  
**Ruta / pantalla:** `/mi-perfil`  
**Acceso:** Menú superior → "Mi Perfil" | Dashboard → "Editar perfil"

### ¿Qué es?
Aquí puedes ver y editar tu información personal. Nombre, apellidos y correo **no son editables** (quedaron fijos al registrarte).

### Campos editables

| Campo | Obligatorio para finalizar postulación | Validación |
|---|---|---|
| Teléfono | No | 10–15 caracteres; puede incluir +, espacios, guiones, paréntesis. Ej.: +52 229 123 4567 |
| Fecha de nacimiento | No | Debes tener al menos 18 años |
| Ciudad | No | Texto libre |
| País | No | Texto libre |
| URL de LinkedIn | No | Debe comenzar exactamente con `https://linkedin.com/in/` seguido de tu usuario |
| **Vacante (puesto al que aplicas)** | **SÍ** | Máximo 200 caracteres. Ej.: "Oficial de Puente", "Maquinista Naval", "Práctico de Puerto" |

### Pasos para editar tu perfil
1. Ve a "Mi Perfil" desde el menú.
2. El formulario muestra tus datos actuales; nombre, apellidos y correo aparecen en gris (solo lectura).
3. Modifica los campos que desees.
4. Pon especial atención en el campo **"Vacante"** — es obligatorio para completar tu expediente y finalizar la postulación.
5. Haz clic en **"Guardar Cambios"**.
6. Verás el mensaje de éxito y serás redirigido al Dashboard.
7. Para cancelar sin guardar, haz clic en **"Cancelar"**.

### Errores comunes

| Situación | Mensaje que verás |
|---|---|
| Fecha de nacimiento < 18 años | "Debes tener al menos 18 años" |
| Teléfono con formato incorrecto | "Teléfono inválido (10-15 caracteres)" |
| URL de LinkedIn incorrecta | "URL de LinkedIn inválida" |
| Vacante con más de 200 caracteres | "Máximo 200 caracteres" |

---

## 9. MI CV

**Nombre de la función:** Gestión del Currículum Vitae con versionado  
**Ruta / pantalla:** `/mi-cv`  
**Acceso:** Menú superior → "Mi CV" | Dashboard → "Gestionar CV"

### ¿Qué es?
La sección donde subes y gestionas tu Currículum Vitae. El sistema conserva un **historial de versiones**: cada vez que subes un nuevo CV se crea una versión nueva (v1, v2, v3…) sin borrar las anteriores. El evaluador siempre ve la versión más reciente.

### Acciones disponibles
- Subir un nuevo CV (PDF)
- Ver el CV actual
- Descargar cualquier versión
- Renombrar cualquier versión
- Eliminar versiones del historial
- Ver el historial completo de versiones

---

### 9.1 Subir un CV nuevo

**Pasos:**
1. Ve a "Mi CV".
2. En la sección **"Cargar CV en PDF"** (tarjeta dorada), puedes subir de dos formas:
   - **Arrastrando:** toma tu archivo PDF y suéltalo sobre la zona punteada que dice "Arrastra tu CV aquí".
   - **Haciendo clic:** haz clic sobre esa zona para abrir el explorador de archivos y selecciona el PDF.
3. Aparecerá el nombre y tamaño del archivo seleccionado.
4. Haz clic en **"Subir CV"**.
5. Una barra de progreso muestra el avance de la carga.
6. Al terminar verás: _"¡CV subido! Tu CV (v2) ha sido guardado exitosamente."_

**Requisitos del archivo:**
- **Formato:** Solo PDF. No se aceptan archivos Word (.docx), imágenes, etc.
- **Tamaño:** Sin límite definido, pero se recomienda menos de 10 MB para mayor velocidad.
- **Versiones máximas:** Hasta **10 versiones** por postulante.

**Errores comunes:**

| Situación | Mensaje que verás |
|---|---|
| Archivo que no es PDF | "Solo se aceptan archivos PDF" |
| Mismo archivo ya subido antes | "Este CV ya fue cargado anteriormente (idéntico)" |
| Se alcanzó el límite de versiones | "Máximo 10 versiones permitidas" (elimina alguna versión anterior) |

---

### 9.2 Ver el CV actual

- En la parte superior de la página (tarjeta verde) aparece el CV vigente con:
  - Nombre del archivo
  - Número de versión (Versión 1, Versión 2…)
  - Tamaño del archivo
  - Fecha de subida

---

### 9.3 Descargar un CV

1. Ve a "Mi CV".
2. En la tarjeta del CV actual, haz clic en **"📥 Descargar"**.
3. El PDF se abrirá en una nueva pestaña del navegador; desde ahí puedes guardarlo.
4. También puedes descargar versiones anteriores desde el historial haciendo clic en el ícono 📥 de cada fila.

---

### 9.4 Renombrar un CV

1. Ve a "Mi CV".
2. En el CV actual o en el historial, haz clic en **"✏️ Renombrar"**.
3. Aparece un cuadro de diálogo con el nombre actual.
4. Borra el nombre y escribe el nuevo (no puede estar vacío).
5. Haz clic en **"Guardar"**.

---

### 9.5 Eliminar una versión del CV

1. Ve a "Mi CV".
2. En el CV actual o en el historial, haz clic en **"🗑 Eliminar"**.
3. Aparece la advertencia: _"Esta acción no se puede deshacer."_
4. Si estás seguro, haz clic en **"Sí, eliminar"**. Para cancelar, haz clic en "Cancelar".

> **Advertencia:** Si eliminas tu único CV, el requisito de CV en tu expediente quedará incompleto y el porcentaje bajará.

---

### 9.6 Historial de versiones

- Si has subido más de una versión, aparece una tabla al final de la página con todas las versiones.
- Columnas: Versión, Nombre, Tamaño, Fecha, Acciones (📥 descargar, ✏️ renombrar, 🗑 eliminar).
- La versión vigente muestra el badge **"Actual"** en verde.

---

## 10. MIS CURSOS Y CERTIFICACIONES

**Nombre de la función:** Registro de cursos, diplomados y certificaciones  
**Ruta / pantalla:** `/mis-cursos`  
**Acceso:** Menú superior → "Mis cursos" | Al final de "Mi CV" → botón "Ir a mis cursos y certificados"

### ¿Qué es?
Aquí registras los cursos, diplomados y certificaciones que has completado. Puedes subir el PDF de cada certificado y el sistema usa **Inteligencia Artificial (IA)** para leer el documento y proponer automáticamente el nombre del curso y las fechas. Tú revisas, corriges si es necesario, y confirmas.

### La pantalla tiene dos paneles
- **Izquierdo:** Zona de carga del certificado PDF + formulario de confirmación de datos.
- **Derecho:** Tabla con todos tus cursos ya registrados.

---

### 10.1 Agregar un curso/certificado con IA

**Pasos:**
1. Ve a "Mis cursos".
2. En el panel izquierdo, arrastra tu certificado en PDF a la zona punteada, o haz clic en ella para seleccionarlo.
3. El sistema sube el archivo y lo analiza automáticamente (verás el mensaje _"Analizando PDF con IA…"_).
4. Al terminar el análisis, aparece un formulario con los datos que la IA detectó:
   - **Nombre del curso / certificación** — con un indicador de confianza: ✓ alta (verde), ~ media (amarillo), ! baja (rojo).
   - **Fecha de inicio / emisión / finalización** — con indicador de confianza.
   - **Fecha de vencimiento** — solo si el certificado expira.
5. **Revisa todos los datos** y corrige cualquier error. La IA puede equivocarse, especialmente en fechas o nombres largos.
6. El campo **"Nombre del curso"** es **obligatorio**. Las fechas son opcionales.
7. Haz clic en **"💾 Guardar curso"**.
8. El curso aparece en la tabla del panel derecho.

**¿Qué pasa si la IA falla?**
- Aparece el aviso: _"Entrada manual — No se pudo conectar con el servicio de IA. Ingresa los datos manualmente."_
- El formulario queda vacío para que lo llenes tú mismo.
- Esto es normal. Puedes seguir guardando el curso con los datos que escribas a mano.

**Requisitos del archivo:**
- **Formato:** Solo PDF.
- **Tamaño máximo:** 20 MB.
- **Un archivo a la vez** (no carga múltiple).

**Errores comunes:**

| Situación | Mensaje que verás |
|---|---|
| Archivo que no es PDF | "Solo se aceptan archivos PDF." |
| PDF sin texto legible (imagen escaneada sin OCR) | La IA no extrae datos; debes ingresarlos manualmente |
| Nombre del curso vacío | El botón "Guardar" permanece deshabilitado |
| Error al guardar | Aparece una alerta roja con el mensaje del servidor |

---

### 10.2 Indicadores de confianza de la IA

Los badges de confianza te dicen qué tan segura está la IA de los datos que extrajo:
- **✓ alta (verde):** El dato es muy probablemente correcto.
- **~ media (amarillo):** Revisa el dato con cuidado.
- **! baja (rojo):** Es muy probable que el dato esté mal. Corrígelo.

---

### 10.3 Cancelar antes de guardar

Si decidiste no agregar el curso después de subir el PDF, haz clic en **"Cancelar"**. El PDF no se guardará y volverás a la zona de carga.

---

### 10.4 Ver la lista de cursos registrados

La tabla en el panel derecho muestra todos tus cursos con:
- **Curso** (nombre e institución si se capturó)
- **Fecha inicio**
- **Fecha vence** — si hay una fecha de vencimiento y ya pasó, aparece en rojo con el badge **"Vencido"**
- **Documento** — enlace para descargar el PDF del certificado (si lo subiste)
- **Acciones** — botones de renombrar (✏️) y eliminar (🗑)

---

### 10.5 Renombrar un curso

1. En la fila del curso, haz clic en **✏️**.
2. Escribe el nuevo nombre del curso (no puede estar vacío).
3. Haz clic en **"Guardar"**.

---

### 10.6 Eliminar un curso

1. En la fila del curso, haz clic en **🗑**.
2. Aparece la advertencia: _"Esta acción no se puede deshacer."_
3. Confirma con **"Sí, eliminar"**.

---

## 11. DOCUMENTOS PERSONALES

**Nombre de la función:** Subida de documentos de identidad personal  
**Ruta / pantalla:** `/mis-docs-personales`  
**Acceso:** Menú superior → "Docs personales"

### ¿Qué es?
Aquí subes tus documentos de identificación oficial. La pantalla muestra **4 tarjetas**, una por tipo de documento.

### Tipos de documentos y su carácter obligatorio

| Documento | ¿Obligatorio para finalizar postulación? |
|---|---|
| 🪪 CURP | **SÍ** — obligatorio |
| 🪪 INE (Credencial de elector) | **SÍ** — obligatorio |
| 📄 Acta de nacimiento | **SÍ** — obligatoria |
| ✈️ Visa | **NO** — opcional |

> **Importante:** Para finalizar tu postulación necesitas al menos un archivo en CURP, INE y Acta de nacimiento. La Visa es completamente opcional — si no la tienes, puedes igualmente completar y enviar tu expediente.

---

### 11.1 Subir un documento personal

**Pasos:**
1. Ve a "Docs personales" desde el menú.
2. Localiza la tarjeta del tipo de documento que quieres subir.
3. Haz clic en **"+ Subir archivo"** dentro de esa tarjeta.
4. Se abre el explorador de archivos de tu computadora. Selecciona el archivo.
5. El sistema lo sube y muestra una barra de progreso.
6. Al terminar verás el mensaje de éxito y el archivo aparecerá en la lista de esa tarjeta.

**Requisitos del archivo:**
- **Formatos aceptados:** PDF, JPG o PNG.
- Puedes subir **múltiples archivos** por tipo (por ejemplo, frente y reverso de tu INE por separado).

**Errores comunes:**

| Situación | Mensaje que verás |
|---|---|
| Formato incorrecto (Word, Excel, etc.) | "Solo se aceptan PDF, JPG o PNG." |

---

### 11.2 Descargar un documento personal

1. En la tarjeta del tipo de documento, localiza el archivo en la lista.
2. Haz clic en el botón **"↓"** (descarga) de ese archivo.
3. El archivo se abrirá en una nueva pestaña.

---

### 11.3 Renombrar un documento personal

1. En la lista del tipo de documento, haz clic en el botón **✏️** del archivo que quieres renombrar.
2. Escribe el nuevo nombre en el cuadro de diálogo (no puede estar vacío).
3. Haz clic en **"Guardar"**.

---

### 11.4 Eliminar un documento personal

1. En la lista, haz clic en el botón **✕** (eliminar) del archivo.
2. Aparece la advertencia: _"Se eliminará '…'. Esta acción no se puede deshacer."_
3. Confirma con **"Eliminar"**. Para cancelar, cierra el diálogo.

> **Advertencia:** Si eliminas el único archivo de un tipo obligatorio (CURP, INE o Acta), ese requisito quedará incompleto y el porcentaje de tu expediente bajará.

---

### 11.5 Contador de tipos entregados

En la esquina superior derecha de la pantalla aparece un badge como **"2 / 3 tipos entregados"**:
- Cuenta solo los 3 tipos **obligatorios** (CURP, INE, Acta).
- La Visa no entra en el conteo.
- El badge se pone verde cuando llega a **3 / 3**.

---

## 12. MI NUBE DOCUMENTAL

**Nombre de la función:** Nube documental personal del postulante  
**Ruta / pantalla:** `/mi-nube`  
**Acceso:** Disponible desde la URL directa (este módulo aún no aparece en el menú principal)

### ¿Qué es?
Es un espacio de almacenamiento personal organizado en **carpetas y subcarpetas** donde puedes guardar archivos PDF adicionales. Piénsalo como una carpeta personal en la nube, pero solo para PDFs y dentro del portal.

> **Diferencia con Documentos Personales:** Los archivos de Mi Nube son organizativos y **no afectan directamente el porcentaje del expediente**. Los documentos de identidad (CURP, INE, Acta) deben subirse en la sección "Docs personales", no aquí.

---

### 12.1 Subir archivos PDF

**Pasos:**
1. Ve a `/mi-nube`.
2. Si quieres subir el archivo dentro de una carpeta específica, navega primero a esa carpeta.
3. En la parte superior, elige la **categoría** del archivo en el menú desplegable: CV, Curso, Certificación u Otro.
4. Si el archivo corresponde a un curso/certificación que aparece en tu CV, activa el interruptor **"Curso/certificación aparece en CV"**.
5. Haz clic en el botón verde **"Subir PDF(s)"**.
6. Selecciona uno o más archivos PDF desde tu computadora.
7. El sistema los sube en secuencia y muestra una barra de progreso.
8. Al terminar verás el mensaje de éxito y los archivos aparecen en la tabla.

**Requisitos:**
- **Formato:** Solo PDF.
- **Múltiples archivos:** Puedes seleccionar varios PDFs a la vez.

---

### 12.2 Crear una carpeta

**Pasos:**
1. Haz clic en **"Nueva carpeta"** (botón en la parte superior).
2. Aparece una ventana emergente.
3. Escribe el **nombre** de la carpeta (máximo 120 caracteres).
4. Elige la **categoría** (CV, Curso, Certificación u Otro).
5. Haz clic en **"Crear"**.
6. La carpeta aparece en la tabla con el ícono 📁.

---

### 12.3 Navegar entre carpetas (Breadcrumbs)

- Para **entrar a una carpeta**, haz clic en su nombre en la tabla.
- En la parte superior aparecen las **migas de pan** (breadcrumb) con tu posición actual. Ejemplo: `Raíz → Certificaciones → 2024`.
- Para **regresar a una carpeta anterior**, haz clic en su nombre en el breadcrumb.
- Para ir a la **raíz** (nivel inicial), haz clic en "Raíz" en el breadcrumb.

---

### 12.4 Filtrar por categoría

- En la parte superior hay un selector **"Todas las categorías"**.
- Elige CV, Curso, Certificación u Otro para ver solo elementos de esa categoría.
- Vuelve a seleccionar "Todas las categorías" para ver todo de nuevo.

---

### 12.5 Cambiar la categoría de un archivo o carpeta

- En la tabla, cada fila tiene un selector de categoría en la columna "Categoría".
- Cambia el valor del selector para reclasificar ese elemento (el cambio se guarda automáticamente).

---

### 12.6 Renombrar un archivo o carpeta

**Pasos:**
1. En la fila del elemento, haz clic en **"Renombrar"**.
2. Aparece una ventana emergente con el nombre actual.
3. Escribe el nuevo nombre (máximo 160 caracteres para archivos; no puede estar vacío).
4. Haz clic en **"Guardar"**.

---

### 12.7 Descargar un archivo

1. En la fila del archivo (solo aplica a archivos, no carpetas), haz clic en **"Descargar"**.
2. El PDF se abrirá en una nueva pestaña del navegador.

---

### 12.8 Eliminar un archivo o carpeta

**Pasos:**
1. En la fila del elemento, haz clic en **"Eliminar"**.
2. Si es un **archivo**: la advertencia dice _"No se puede deshacer."_
3. Si es una **carpeta**: la advertencia dice _"Se eliminarán también sus subcarpetas y archivos."_
4. Confirma con **"Eliminar"**.

> **Advertencia:** Eliminar una carpeta borra permanentemente **todo su contenido** (subcarpetas y archivos). Esta acción no puede deshacerse.

---

## 13. ESTADO DE LA POSTULACIÓN

**Nombre de la función:** Seguimiento del estado de postulación  
**Ruta / pantalla:** `/estado`  
**Acceso:** Menú superior → "Estado"

### ¿Qué es?
Una pantalla de solo lectura que muestra el estado actual de tu postulación según la revisión del evaluador.

### Estados posibles

| Estado | Ícono | Significado |
|---|---|---|
| **En proceso** | ⏳ | Tu expediente está siendo revisado. Asegúrate de que esté completo y enviado. |
| **Completado** | ✓ | ¡Tu postulación fue aceptada exitosamente! |
| **Rechazado** | ✕ | Tu postulación no fue aceptada en esta convocatoria. |

### Comentarios del evaluador

Si el evaluador ha revisado tu expediente, aparecerá aquí cada comentario con:
- Nombre del evaluador
- Fecha y hora del comentario
- Estado sugerido por el evaluador
- Calificación numérica (si la capturó)
- Texto completo del comentario

Si no hay comentarios aún, verás: _"Los comentarios aparecerán aquí cuando el evaluador revise tu CV."_

> Los mismos comentarios también aparecen en la sección inferior del Dashboard.

---

## 14. EXPEDIENTE COMPLETO Y FINALIZAR POSTULACIÓN

**Nombre de la función:** Expediente + envío de postulación  
**Ruta / pantalla:** `/dashboard` (la barra y el botón de finalizar están en el Dashboard)

### ¿Qué es el expediente?
El expediente es el conjunto de documentos y datos que el sistema verifica automáticamente. Su porcentaje indica qué tan completo está.

### 14.1 Requisitos del expediente (los 5 obligatorios)

Para llegar al **100%** y poder finalizar tu postulación debes completar exactamente estos 5 requisitos:

| # | Requisito | Sección donde completarlo |
|---|---|---|
| 1 | **CV (Currículum Vitae)** | Menú → Mi CV |
| 2 | **CURP** | Menú → Docs personales → tarjeta CURP |
| 3 | **INE / Credencial de elector** | Menú → Docs personales → tarjeta INE |
| 4 | **Acta de nacimiento** | Menú → Docs personales → tarjeta Acta |
| 5 | **Vacante (puesto al que aplicas)** | Menú → Mi Perfil → campo Vacante |

> La **Visa** es opcional y NO forma parte de los 5 requisitos. Puedes finalizar tu postulación sin ella.

Cada requisito cumplido aporta el **20%** al porcentaje total (5 × 20% = 100%).

---

### 14.2 Ver el checklist de requisitos

1. Ve al Dashboard.
2. En la tarjeta del expediente, la barra de progreso muestra el porcentaje global.
3. Debajo de la barra aparece el checklist con ✅ (cumplido) o ❌ (pendiente) para cada requisito.
4. Los requisitos pendientes muestran el botón **"Ir →"** que te lleva directamente a la sección donde debes completarlos.

---

### 14.3 Finalizar la postulación

**Cuándo se puede:** Solo cuando el porcentaje del expediente es **100%** (todos los 5 requisitos cumplidos).

**Pasos:**
1. Ve al Dashboard.
2. Cuando el expediente esté al 100%, el botón **"🚀 Finalizar postulación"** se activa en azul.
3. Haz clic en ese botón.
4. Aparece la ventana de confirmación:
   > _"¿Finalizar postulación? Tu expediente quedará marcado como Enviado. Podrás seguir consultando tus documentos, pero ya no podrás modificar el estado."_
5. Haz clic en **"Sí, enviar"** para confirmar, o en **"Cancelar"** si aún no estás listo.
6. Si confirmas, verás el mensaje: _"¡Postulación enviada! Tu expediente ha sido registrado exitosamente."_
7. La tarjeta del expediente cambia a **verde** y muestra "✅ Expediente enviado" con la fecha de envío.

---

### 14.4 Qué cambia después de finalizar

- El botón "Finalizar postulación" desaparece (no puedes volver a hacer clic).
- La barra del expediente se pone **verde** con el texto "Enviado".
- Puedes seguir consultando y descargando todos tus documentos.
- El evaluador puede revisar tu expediente completo.

---

### 14.5 Errores comunes al finalizar

| Situación | Qué pasa |
|---|---|
| El botón está gris y deshabilitado | El expediente no está al 100%. Revisa el checklist y completa los requisitos con ❌. |
| "El expediente no está completo. Falta: [lista]" | Algún requisito falta en el servidor. Completa lo que indica el mensaje. |
| "El expediente ya fue enviado" | Ya finalizaste tu postulación anteriormente. El estado ya es "Enviado". |
| Error de red al enviar | Intenta de nuevo en unos minutos. Si persiste, contacta al administrador. |

---

## 15. PREGUNTAS FRECUENTES

---

**P1: ¿Cómo subo mi CURP?**

Ve al menú superior y selecciona **"Docs personales"** (`/mis-docs-personales`). Verás 4 tarjetas: CURP, INE, Acta de nacimiento y Visa. En la tarjeta de CURP, haz clic en **"+ Subir archivo"** y selecciona tu archivo desde la computadora. Acepta PDF, JPG o PNG. Una vez subido, el requisito queda marcado como cumplido en tu expediente.

---

**P2: ¿Por qué no puedo finalizar mi postulación? El botón está gris.**

El botón "Finalizar postulación" solo se activa cuando el expediente está al **100%** (los 5 requisitos cumplidos). Revisa el checklist en el Dashboard y busca los ❌. Los 5 requisitos son: subir el CV, subir la CURP, subir la INE, subir el Acta de nacimiento, y llenar el campo "Vacante" en tu perfil. Haz clic en los botones **"Ir →"** junto a cada ❌ para ir directamente a completarlos.

---

**P3: ¿Qué pasa si no tengo Visa?**

La Visa es **completamente opcional**. No es un requisito del expediente y no afecta el porcentaje de avance. Puedes llegar al 100% y finalizar tu postulación perfectamente sin tener Visa. Si en algún momento la obtienes, puedes subirla en "Docs personales" sin problema.

---

**P4: ¿Puedo subir varios archivos de INE (frente y reverso por separado)?**

Sí. Cada tarjeta en "Docs personales" permite múltiples archivos. Puedes subir el frente de tu INE como un archivo y el reverso como otro, ambos bajo la misma tarjeta de INE. El requisito se considera cumplido con al menos **un** archivo subido por tipo.

---

**P5: ¿Cuántas versiones de CV puedo tener?**

Hasta **10 versiones** en el historial. Cada vez que subes un PDF nuevo, se crea una versión nueva sin borrar las anteriores. Si llegas al límite de 10, deberás eliminar alguna versión anterior desde "Mi CV" antes de poder subir una nueva.

---

**P6: La IA leyó mal las fechas de mi certificado. ¿Qué hago?**

Corrígelas directamente en el formulario que aparece después del análisis. Los campos son editables: simplemente borra lo que propuso la IA y escribe la fecha correcta. La IA no siempre acierta, especialmente con formatos de fecha inusuales o PDFs con mucho diseño gráfico. Lo que tú escribas en el formulario es lo que se guardará, no los valores de la IA.

---

**P7: ¿Qué diferencia hay entre "Mi Nube" y "Documentos Personales"?**

**Documentos Personales** es para los documentos de identidad obligatorios del proceso (CURP, INE, Acta). Subirlos ahí impacta directamente el porcentaje de tu expediente.

**Mi Nube** es un espacio de almacenamiento personal libre, organizado en carpetas. Puedes subir allí cualquier PDF adicional (diplomas, referencias, etc.) solo para tener todo ordenado. Los archivos de Mi Nube no afectan el porcentaje del expediente.

---

**P8: ¿Puedo modificar mi postulación después de haberla finalizado?**

Una vez que confirmas "Finalizar postulación", el expediente queda en estado **"Enviado"** y no puedes revertirlo desde el portal. Puedes seguir viendo tus documentos, pero no puedes cambiar el estado. Si necesitas hacer alguna corrección urgente (por ejemplo, cambiar la vacante), contacta directamente al equipo de recursos humanos de la ENMV.

---

**P9: ¿Cómo sé si el evaluador ya revisó mi expediente?**

Ve a la sección **"Estado"** desde el menú superior. Si el evaluador ha revisado tu expediente y dejó comentarios, los verás ahí con la fecha, el texto y la calificación. También aparecen en la parte inferior del Dashboard. Si no hay nada, significa que aún no ha revisado tu expediente.

---

**P10: No llegó el correo de recuperación de contraseña. ¿Qué hago?**

Espera al menos 5 minutos y luego revisa también tu carpeta de **spam o correo no deseado**. Verifica que el correo que escribiste en el formulario sea el mismo con el que te registraste (sin errores tipográficos). Puedes intentar solicitar el enlace de nuevo desde `/recuperar-contrasena`. Si después de todo eso sigue sin llegar, contacta al equipo de soporte de la ENMV con tu nombre y correo para que puedan ayudarte.

---

**P11: ¿Puedo subir el mismo CV varias veces?**

No. El sistema detecta cuando el contenido del archivo es idéntico a uno que ya subiste y te muestra el mensaje: **"Este CV ya fue cargado anteriormente (idéntico)"**. Si hiciste cambios al CV, guarda el archivo como PDF de nuevo y súbelo — el sistema detectará que es diferente y lo aceptará como nueva versión.

---

**P12: ¿Qué significa el porcentaje de mi expediente?**

Indica cuántos de los 5 requisitos obligatorios tienes completados:
- Cada requisito aporta el **20%** (5 × 20% = 100%).
- Necesitas el **100%** para poder finalizar la postulación.
- Requisitos: CV subido + CURP subida + INE subida + Acta subida + Vacante en el perfil.
- La Visa no cuenta en este porcentaje.

---

**P13: ¿Qué pasa si elimino una carpeta en Mi Nube por error?**

Lamentablemente la eliminación de carpetas es **definitiva y no tiene opción de deshacer**. Al eliminar una carpeta se eliminan también todos sus archivos y subcarpetas. Por eso el sistema siempre pide confirmación antes de eliminar. Si eliminaste algo importante, tendrás que volver a crear la carpeta y subir los archivos de nuevo.

---

**P14: ¿Mi nombre o correo electrónico se pueden cambiar?**

No desde el portal. El nombre completo (nombre y apellidos) y el correo electrónico **son de solo lectura** en el perfil del postulante; se fijaron al registrarte. Si necesitas corregirlos por un error, contacta al administrador del sistema para que lo actualice manualmente.

---

**P15: El sistema me pide cambiar mi contraseña al entrar, ¿qué hago?**

Esto ocurre cuando el administrador creó tu cuenta con una contraseña temporal. El sistema te redirige automáticamente a la pantalla `/cambiar-contrasena`. Necesitas:
1. Tu **correo** (aparece prellenado).
2. La **contraseña temporal** que te proporcionó el administrador (por correo o en persona).
3. Una **nueva contraseña** que cumpla: mínimo 10 caracteres, al menos una minúscula, una mayúscula y un número.

Ejemplo válido: `MiContrasena2026`. Después de cambiarla, ya puedes entrar con normalidad.

---

*Fin del manual — Base de conocimiento v1.1 | Portal del Postulante ENMV*  
*Generado: 2026-07-01 | Basado en el código fuente de apps/web y apps/api*
