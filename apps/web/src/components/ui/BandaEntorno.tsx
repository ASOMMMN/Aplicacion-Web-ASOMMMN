/**
 * Banda fija al inicio de la página que avisa que NO es producción. Componente de
 * servidor (sin JavaScript en el cliente); el layout solo lo monta si
 * NEXT_PUBLIC_ENTORNO=staging.
 */
export function BandaEntorno({ etiqueta }: { etiqueta: string }) {
  return (
    <div
      role="status"
      style={{
        background: '#b45309',
        color: '#fff',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding: '4px 8px',
      }}
    >
      {etiqueta} · entorno de pruebas: no uses datos reales
    </div>
  );
}
