/** Escapa caracteres especiales de regex para usar un string de usuario en un $regex de Mongo sin riesgo de ReDoS/inyección. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
