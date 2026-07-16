import type { Metadata } from 'next';
import { Playfair_Display, Public_Sans } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@/styles/globals.css';

// Playfair Display: reservada ÚNICAMENTE para el nombre de la escuela
// (navbar y pantallas de autenticación). Todo lo demás usa Public Sans.
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ENMV — Evaluación Curricular',
  description: 'Sistema de evaluación curricular — Escuela Náutica Mercante de Veracruz',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${playfair.variable} ${publicSans.variable}`}>
      <body style={{ fontFamily: 'var(--font-public-sans, var(--bs-font-sans-serif))' }}>
        {children}
      </body>
    </html>
  );
}
