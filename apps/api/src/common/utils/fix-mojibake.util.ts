/**
 * Repara nombres de archivo que llegaron como mojibake: el cliente envía el
 * nombre en bytes UTF-8 dentro del header `Content-Disposition` del
 * multipart/form-data, pero busboy/multer decodifica ese header como
 * Latin-1 (no hay forma de configurar el charset), produciendo cadenas como
 * "MARÃ­A" en vez de "MARÍA". Esta función revierte esa mala decodificación
 * reinterpretando los code points como bytes Latin-1 y volviendo a
 * decodificarlos como UTF-8.
 *
 * Es un no-op seguro para nombres puramente ASCII (Latin-1 y UTF-8
 * coinciden en ese rango) y se descarta si el resultado no es UTF-8 válido,
 * para no corromper nombres que no sufrían este problema.
 */
export function corregirMojibakeLatin1(valor: string): string {
  if (!valor) return valor;

  // Un nombre que ya tiene code points fuera de Latin-1 (p.ej. "—", comillas
  // tipográficas, emoji, "Ł") no puede ser el resultado de decodificar bytes
  // UTF-8 como Latin-1: esa decodificación solo produce code points 0-255.
  // Intentar "repararlo" igual es peligroso: Buffer.from(valor, 'latin1')
  // trunca cada unidad UTF-16 a su byte bajo, lo que para varios de estos
  // caracteres da una secuencia que es ASCII válida pero totalmente
  // distinta (p.ej. "—" U+2014 se truncaría al control char 0x14), sin
  // disparar la protección de "UTF-8 inválido" de más abajo.
  if (/[^\u0000-ÿ]/.test(valor)) {
    return valor.normalize('NFC');
  }

  const reparado = Buffer.from(valor, 'latin1').toString('utf8');

  if (reparado.includes('�')) {
    return valor.normalize('NFC');
  }

  return reparado.normalize('NFC');
}
