import { redirect } from 'next/navigation';

// La raíz redirige al login; el middleware se encarga
// de redirigir al dashboard si ya hay sesión activa.
export default function RootPage() {
  redirect('/login');
}
