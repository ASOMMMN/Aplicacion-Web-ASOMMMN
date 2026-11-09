# Escáner de documentos: pruebas manuales en celular

Pruebas que no se pueden automatizar (cámara real, Safari iOS, memoria del
dispositivo). Hacerlas en **un iPhone con Safari** y **un Android de gama media
con Chrome**, contra un ambiente con S3 y OpenAI reales (staging), con un
postulante de prueba.

Anota en cada caso: dispositivo, versión del navegador, ✅/❌ y observaciones.

## Preparación

- Ten a la mano una INE (frente y reverso), un pasaporte y un certificado de
  varias hojas. Pueden ser tuyos: nada sale del celular sin procesar y solo se
  sube el PDF final, igual que hoy.
- Entra como postulante a **Documentos personales**.
- La **cámara en vivo** (visor dentro de la página) solo existe en HTTPS o en
  `localhost`. Por `http://<IP-de-tu-PC>` el escáner usa la app de cámara del
  teléfono; el resto del flujo es igual.
  - **Android en local**: conecta el celular por USB con la depuración USB
    activada, abre `chrome://inspect/#devices` en Chrome de la PC → **Port
    forwarding** → agrega `3000 → localhost:3000` y `3001 → localhost:3001` y
    activa la casilla. En el celular abre `http://localhost:3000` (cuenta como
    contexto seguro y la API ya permite ese origen por CORS).
  - **iPhone**: Safari no reenvía puertos; prueba la cámara en vivo en staging
    (HTTPS).

## 0. Cámara en vivo y permisos

1. Toca **Escanear con cámara** → **Tomar foto**.
   - ✅ El navegador pide permiso de cámara (solo la primera vez) y aparece
     “Abriendo la cámara…”.
   - ✅ Al permitir, se ve la cámara **trasera** dentro del escáner, con el
     obturador dorado al centro.
2. Toca el obturador.
   - ✅ Se apaga el indicador de cámara del sistema y pasa a “Buscando los bordes…”.
3. **Repetir** en el ajuste de esquinas: vuelve al visor. **Agregar página**:
   abre el visor directo.
4. **Cancelar** en el visor: regresa a las páginas (o al inicio si no hay).
5. Niega el permiso (o bloquéalo en la configuración del sitio y reabre el escáner).
   - ✅ Aparece el aviso “No hay permiso para usar la cámara…” con
     **Usar la app de cámara**, **Elegir de la galería** y **Reintentar**.
   - ✅ **Usar la app de cámara** abre la cámara del sistema y la foto sigue
     el flujo normal. Desde ahí, **Tomar foto** ya no vuelve a pedir permiso:
     usa la app de cámara directamente.
6. Con el visor abierto, cambia a otra app y regresa.
   - ✅ Sigue la imagen, o aparece “La cámara se detuvo” con **Reintentar**.
7. En escritorio con webcam: se usa la webcam (no hay cámara trasera).

## 1. Flujo principal: INE frente y reverso → un PDF

1. En la tarjeta **INE**, toca **Escanear con cámara** → **Tomar foto**.
   - ✅ Se abre la cámara trasera (visor en vivo o app de cámara, ver sección 0).
2. Toma el frente sobre una mesa oscura, en ángulo (~30°).
   - ✅ Aparece “Leyendo la foto…” y luego “Buscando los bordes…”, sin que la
     pantalla se congele.
   - ✅ Los 4 puntos quedan en las esquinas de la credencial.
3. Toca **Continuar**.
   - ✅ La credencial sale recta, recortada y legible (modo Color).
4. Toca **Agregar página** y toma el reverso.
5. Toca **Usar este documento**.
   - ✅ La barra de progreso avanza y se sube `INE_escaneo_AAAA-MM-DD.pdf`.
   - ✅ Abre el PDF desde la tarjeta: 2 páginas, en orden, legibles (MRZ y QR).
   - ✅ Peso razonable (normalmente < 1 MB para una INE).
6. Como evaluador, abre el documento del postulante.
   - ✅ El análisis IA extrajo las fechas (o quedó en “Volver a analizar” con
     el mismo resultado que una foto normal).

## 2. Foto en ángulo y con sombra

1. Toma una hoja con la sombra del celular o de la mano encima.
   - ✅ En **Color** la sombra desaparece o queda muy tenue y el texto se lee.
   - ✅ En **Blanco y negro** el fondo queda blanco y el texto negro.
   - ✅ En **Color** la foto y los sellos de la INE conservan su color.
     ⚠️ Revisa que la foto de la credencial no quede “lavada” (muy clara); ver
     limitaciones en el Manual Técnico.

## 3. Detección fallida → esquinas manuales

1. Toma la INE sobre una superficie **blanca** (poco contraste).
   - ✅ Si no encuentra los bordes, aparece en rojo “No encontramos los bordes…”
     con un rectángulo de respaldo.
2. Arrastra cada punto con el dedo.
   - ✅ Aparece la lupa del lado contrario al dedo.
   - ✅ Si cruzas los puntos, se avisa y **Continuar** queda deshabilitado.
3. **Continuar** → la página sale recortada según tus puntos.

## 4. Edición antes de subir

- **Girar**: rota 90° cada vez; los botones no cambian de lugar.
- **Ajustar esquinas** en una página ya procesada: vuelve al editor con los
  puntos anteriores.
- **Repetir** en una página: reemplaza solo esa página.
- Con 3 o más páginas: reordena con las flechas y elimina una con la papelera.
- Intenta agregar más de 8 páginas: **Agregar página** se deshabilita.
- Cambia de modo varias veces rápido: siempre queda el último que elegiste.

## 5. Galería, formatos y fotos grandes

- **Elegir de la galería** con una foto existente: funciona igual.
- Foto vertical tomada con el celular de lado: sale en la orientación
  correcta (EXIF).
- iPhone con cámara de 48 MP (si hay): no se cierra la pestaña ni se congela.
- Una captura de pantalla (PNG): se procesa.
- Android: una foto HEIC o WebP de la galería: se procesa o muestra
  “No se pudo leer la imagen…”, sin bloquear el flujo.

## 6. Cancelar y memoria

- Cierra el escáner con la ✕ teniendo páginas: pide confirmación.
- Abre y cierra el escáner 5 veces seguidas con fotos: el celular sigue fluido
  y la pestaña no se recarga sola (iOS lo hace cuando se queda sin memoria).
- ⚠️ Observación de la prueba en escritorio: una vez, después de **Continuar**,
  el escáner regresó a la pantalla de captura (con la página ya guardada; “Volver
  a las páginas” la mostraba bien). No se pudo reproducir. Si te pasa, anota
  qué tocaste justo antes.
- 🔎 **Diagnóstico temporal**: el escáner registra en la consola `[escaner-diag]`
  cada cambio de paso y cada clic en un botón (con los ms desde el último cambio).
  Hipótesis: tras **Continuar** un segundo clic/toque cae sobre **Agregar página**
  (el pie pasa de 2 a 3 botones). Si te pasa, conecta el celular (Chrome:
  `chrome://inspect`; Safari: Inspector web) o, en escritorio, abre la consola y
  copia `window.__escanerDiag`: ahí verás qué botón se tocó y a cuántos ms.
- 🩹 **Mitigación aplicada**: tras entrar a la revisión (después de **Continuar**), 
  **Repetir** y **Agregar página** ignoran los toques durante ~500 ms. Prueba: toca
  **Continuar** una vez y luego **dos veces rápido**: no debe regresar a la captura.
  Si aun así regresa, copia `window.__escanerDiag`: un toque ignorado aparece como
  `click en "Agregar página" a N ms…` **sin** un `paso revision → captura` después.
  El diagnóstico se quita cuando confirmes que ya no ocurre.

## 7. Mis cursos (certificados)

1. En **Mis cursos**, toca **Escanear con cámara** y escanea un certificado de
   2 hojas.
   - ✅ Al tocar **Usar este documento** se analiza con IA y aparece el
     formulario de confirmación con `Certificado_escaneo_….pdf`.
2. Guarda el curso.
   - ✅ El documento aparece en la lista y se puede ver.

## 8. Sin regresiones

- **+ Subir archivo** (PDF, JPG o PNG ya hechos) funciona igual que antes en
  Documentos personales.
- Arrastrar o seleccionar un certificado en Mis cursos funciona igual.
- Otras pantallas (dashboard, CV, panel del evaluador) cargan igual de rápido:
  el escáner solo se descarga al abrirlo.

## 9. Arrastrar y soltar (escritorio)

Probar con archivos reales arrastrados desde el Explorador/Finder. Puntos de
subida: Mi CV, Mis cursos, cada tarjeta de Documentos personales, Mi nube y
Archivos del evaluador.

- Arrastra un PDF válido sobre la zona: se resalta (o aparece la capa) **sin
  parpadear** al pasar sobre el texto y los botones; al soltar sigue el flujo de
  siempre.
- Arrastra y sal de la zona sin soltar: el resaltado desaparece.
- Suelta un `.exe` o un `.docx` donde solo se aceptan PDF/JPG/PNG: mensaje rojo
  con los tipos permitidos y no se sube nada.
- Suelta un archivo mayor al límite (20 MB; 50 MB en evaluador; 100 MB en Mi nube):
  mensaje con el límite, sin subir.
- Suelta una **carpeta**: mensaje “No se pueden subir carpetas”.
- Suelta dos archivos donde solo cabe uno: mensaje “Suelta un solo archivo a la vez”
  (en Mi nube sí se aceptan varios).
- Suelta un archivo **fuera** de cualquier zona (fondo de la página): el navegador
  no lo abre ni cambia de página.
- Con una subida en curso, suelta otro archivo: “Espera a que termine la subida actual.”
- Teclado: con Tab llega a la zona de Mi CV / Mis cursos (anillo dorado) y Enter o
  Espacio abren el selector.
- En Documentos personales y Mis cursos, **Escanear con cámara** y **+ Subir archivo**
  siguen funcionando. Arrastrar imágenes sobre el modal del escáner las agrega como
  páginas (ver sección 10) pero **no sube nada** hasta “Usar este documento”, y la
  tarjeta de atrás no recibe el archivo.

## 10. Computadora (mouse/trackpad) y “Usar tal cual”

El escáner decide por capacidades (mouse y navegador de escritorio), no por el
ancho: en una PC con la ventana angosta sigue mostrando la versión de computadora,
y un celular en horizontal sigue a pantalla completa.

- Abre el escáner en una PC: aparece la caja **Arrastra aquí las fotos del documento**
  (sin “Tomar foto”). El modal es más ancho que en el celular.
- Haz clic en la caja y elige **3 imágenes** a la vez (JPG, PNG y WEBP).
  - ✅ “Procesando imagen 1 de 3…” y luego la revisión con 3 páginas en el orden
    elegido y el aviso “Se agregaron 3 páginas…”.
  - ✅ Vista previa grande a la izquierda; modos, Girar, Ajustar esquinas y
    miniaturas a la derecha.
- Arrastra 2 imágenes más sobre la revisión: se agregan al final.
- Elige 10 imágenes de golpe: entran 8 y el aviso dice cuántas no se agregaron.
- Suelta un **PDF** en el escáner: no se agrega; el aviso indica subirlo con
  “Subir archivo”. Cierra el escáner y súbelo así: entra por el flujo normal.
- HEIC: en Safari (Mac) se procesa; en Chrome/Edge aparece el aviso para
  convertirla a JPG, sin bloquear el resto.
- **Usar webcam**: aparece solo si el equipo tiene cámara. Al usarla se ve la
  webcam; si niegas el permiso, el aviso habla de webcam y ofrece **Subir imágenes**
  (no “app de cámara”). Desconecta la webcam USB con el escáner abierto y vuelve a
  la pantalla inicial: el botón desaparece.
- Esquinas con **mouse**: arrastra cada punto; también con Tab + flechas.
- **Usar tal cual** en el ajuste de esquinas: la página queda completa, sin recorte,
  con el modo **Original** marcado. Cambiar a **Color** mejora esa misma imagen
  completa; **Ajustar esquinas** permite recortarla después.
- En el celular: **Elegir de la galería** permite seleccionar varias fotos y se
  agregan en lote igual que en la PC.
