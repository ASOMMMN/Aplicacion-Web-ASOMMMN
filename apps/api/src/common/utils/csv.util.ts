/**
 * Escapa una celda para CSV de forma segura contra "CSV injection"
 * (fórmulas que Excel/Sheets ejecutan al abrir el archivo si una celda
 * empieza con =, +, -, @ o tab/CR — ej. un nombre guardado como
 * `=HYPERLINK("http://evil","click")` se abriría como fórmula, no texto).
 * Si la celda empieza con alguno de esos caracteres, se le antepone un
 * apóstrofo para que la hoja de cálculo la trate como texto literal.
 * También aplica el escapado estándar de CSV (comillas/comas/saltos de línea).
 */
const CARACTERES_FORMULA = new Set(['=', '+', '-', '@', '\t', '\r']);

export function celdaCsvSegura(valor: string): string {
  let v = valor;
  if (v.length > 0 && CARACTERES_FORMULA.has(v[0])) {
    v = `'${v}`;
  }
  if (/[",\n]/.test(v)) {
    v = `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function filaCsvSegura(valores: string[]): string {
  return valores.map(celdaCsvSegura).join(',');
}
