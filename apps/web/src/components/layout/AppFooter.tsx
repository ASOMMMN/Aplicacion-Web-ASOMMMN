import Link from 'next/link';
import { NOMBRE_LARGO } from '@/lib/branding';
import { RUTA_AVISO_PRIVACIDAD } from '@/lib/privacidad/avisoPrivacidad';

export default function AppFooter() {
  return (
    <footer className="footer-asommmn text-center">
      <div className="container">
        <p className="mb-0 fw-semibold" style={{ color: '#fff', fontSize: '0.85rem' }}>
          {NOMBRE_LARGO}
        </p>
        <Link href={RUTA_AVISO_PRIVACIDAD} className="enlace-aviso-footer">
          Aviso de privacidad
        </Link>
      </div>
    </footer>
  );
}
