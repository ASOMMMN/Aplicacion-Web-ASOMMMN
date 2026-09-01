export interface DocumentChecklistItem {
  label: string;
  completado: boolean;
  opcional?: boolean;
}

export function DocumentChecklist({ items }: { items: DocumentChecklistItem[] }) {
  const obligatorios = items.filter((i) => !i.opcional);
  const completados = obligatorios.filter((i) => i.completado).length;

  return (
    <div className="border rounded p-3 bg-light mb-4">
      <div className="fw-semibold mb-2">
        {completados} de {obligatorios.length} documentos completados
      </div>
      <ul className="list-unstyled mb-0 row">
        {items.map((item) => (
          <li key={item.label} className="col-sm-6 col-lg-4 small mb-1">
            <span className="me-2">{item.completado ? '✅' : item.opcional ? '➖' : '⬜'}</span>
            {item.label}
            {item.opcional && (
              <span className="badge bg-secondary ms-2" style={{ fontSize: '0.65rem', fontWeight: 500 }}>
                Opcional
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
