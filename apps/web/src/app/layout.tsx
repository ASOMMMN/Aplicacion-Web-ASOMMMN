import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/styles/globals.css';
import { TITULO_SISTEMA, DESCRIPCION_SISTEMA } from '@/lib/branding';
import { BloqueoSoltarGlobal } from '@/components/ui/BloqueoSoltarGlobal';
import { BandaEntorno } from '@/components/ui/BandaEntorno';
import { etiquetaEntorno } from '@/lib/entorno/entorno';

// Playfair Display: reservada ÚNICAMENTE para el nombre de la escuela
// (navbar y pantallas de autenticación). Todo lo demás usa Public Sans.
// Las fuentes están en el repo (src/fonts) y NO se descargan de Google al
// compilar: next/font/google hacía una petición de red en cada build y una
// falla intermitente rompía el deploy (Turbopack: "Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'"). Ver src/fonts/README.md.
const playfair = localFont({
  src: '../fonts/PlayfairDisplay-latin-variable.woff2',
  weight: '400 900',
  style: 'normal',
  variable: '--font-playfair',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const publicSans = localFont({
  src: '../fonts/PublicSans-latin-variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-public-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

// Solo en staging (NEXT_PUBLIC_ENTORNO=staging): banda visible y prefijo en el título.
const etiquetaDeEntorno = etiquetaEntorno(process.env.NEXT_PUBLIC_ENTORNO);

export const metadata: Metadata = {
  title: etiquetaDeEntorno ? `[${etiquetaDeEntorno}] ${TITULO_SISTEMA}` : TITULO_SISTEMA,
  description: DESCRIPCION_SISTEMA,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${playfair.variable} ${publicSans.variable}`}>
      <body style={{ fontFamily: 'var(--font-public-sans, var(--bs-font-sans-serif))' }}>
        {etiquetaDeEntorno && <BandaEntorno etiqueta={etiquetaDeEntorno} />}
        <BloqueoSoltarGlobal />
        {children}
      </body>
    </html>
  );
}
