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

## 1. Flujo principal: INE frente y reverso → un PDF

1. En la tarjeta **INE**, toca **Escanear con cámara** → **Tomar foto**.
   - ✅ Se abre la cámara trasera.
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
  siguen funcionando; arrastrar un archivo sobre el modal del escáner no sube nada.
