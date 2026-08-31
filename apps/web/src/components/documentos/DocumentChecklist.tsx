export interface DocumentChecklistItem {
  label: string;
  completado: boolean;
}

export function DocumentChecklist({ items }: { items: DocumentChecklistItem[] }) {
  const completados = items.filter((i) => i.completado).length;

  return (
    <div className="border rounded p-3 bg-light mb-4">
      <div className="fw-semibold mb-2">
        {completados} de {items.length} documentos completados
      </div>
      <ul className="list-unstyled mb-0 row">
        {items.map((item) => (
          <li key={item.label} className="col-sm-6 col-lg-4 small mb-1">
            <span className="me-2">{item.completado ? '✅' : '⬜'}</span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
