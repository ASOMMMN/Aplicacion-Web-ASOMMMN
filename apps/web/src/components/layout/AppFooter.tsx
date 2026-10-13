import { NOMBRE_LARGO } from '@/lib/branding';

export default function AppFooter() {
  return (
    <footer className="footer-asommmn text-center">
      <div className="container">
        <p className="mb-0 fw-semibold" style={{ color: '#fff', fontSize: '0.85rem' }}>
          {NOMBRE_LARGO}
        </p>
      </div>
    </footer>
  );
}
