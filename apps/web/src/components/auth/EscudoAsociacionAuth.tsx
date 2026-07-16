import Image from 'next/image';

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
        alt="Escudo de la Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional"
        width={130}
        height={130}
        className="escudo-login mb-3"
        priority
      />
      <p className="nombre-escuela mb-0">
        Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional
      </p>
    </>
  );
}
