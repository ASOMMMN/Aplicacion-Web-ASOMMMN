# Fuentes autoalojadas

Archivos `woff2` con el subconjunto **latin** (incluye el español: á é í ó ú ñ ü ¿ ¡ y €),
cargados con `next/font/local` en `src/app/layout.tsx`. No hay petición de red a Google al compilar.

| Archivo | Familia | Pesos | Origen |
|---|---|---|---|
| `PublicSans-latin-variable.woff2` | Public Sans (variable) | 100–900 | https://fonts.gstatic.com/s/publicsans/v21/ijwRs572Xtc6ZYQws9YVwnNGfJ7QwOk1.woff2 |
| `PlayfairDisplay-latin-variable.woff2` | Playfair Display (variable) | 400–900 | https://fonts.gstatic.com/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgEM86xQ.woff2 |

Licencia: ambas familias se distribuyen bajo **SIL Open Font License 1.1**
(https://openfontlicense.org), que permite incluirlas y redistribuirlas en el proyecto.

Los subconjuntos `latin-ext`, `vietnamese` y `cyrillic` que antes servía Google no se incluyeron:
`next/font/local` no admite `unicode-range` por archivo. Los caracteres fuera de `latin`
(por ejemplo ł, ő, ș) se ven con la fuente de respaldo del sistema.

Para actualizar: descarga el CSS de Google Fonts con un User-Agent de navegador moderno,
toma la URL del bloque `/* latin */` y reemplaza el archivo.
