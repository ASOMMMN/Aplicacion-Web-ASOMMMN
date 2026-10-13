import Image from 'next/image';
import { ALT_ESCUDO, NOMBRE_LARGO } from '@/lib/branding';

/**
 * Bloque de escudo + nombre de la Asociación Sindical, compartido por las
 * pantallas de login y registro para que ambas usen exactamente el mismo
 * tamaño, posición y tratamiento tipográfico (Playfair Display vía
 * .nombre-escuela).
 */
export default function EscudoAsociacionAuth() {
  return (
    <>
      <Image
        src="/escudo-ASOMMMN-transparente.png"
        alt={ALT_ESCUDO}
        width={130}
        height={130}
        className="escudo-login mb-3"
        priority
      />
      <p className="nombre-escuela mb-0">{NOMBRE_LARGO}</p>
    </>
  );
}
