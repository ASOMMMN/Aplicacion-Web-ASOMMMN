import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Orígenes del frontend local; en desarrollo CORS_ORIGIN se ignora. */
export const ORIGENES_CORS_DESARROLLO = [
  'http://localhost:3000',
  'http://localhost:3002',
];

/**
 * Convierte CORS_ORIGIN en la lista de orígenes permitidos: valores separados
 * por comas, cada uno un origen exacto `https://host[:puerto]` (sin comodines,
 * ruta, barra final ni credenciales). Lanza un Error con un mensaje claro ante
 * cualquier valor ausente o inválido: es mejor que la API no arranque a que
 * acepte un origen que nadie quiso permitir.
 */
export function parsearOrigenesCors(valor: string | undefined): string[] {
  const crudo = (valor ?? '').trim();
  if (!crudo) {
    throw new Error(
      'CORS_ORIGIN no está definida. En producción es obligatoria: lista separada por comas de orígenes exactos, p. ej. https://app.ejemplo.com',
    );
  }

  const origenes = new Set<string>();
  crudo.split(',').forEach((elemento, i) => {
    const origen = elemento.trim();
    const dondeEsta = `CORS_ORIGIN inválida (elemento ${i + 1}: "${origen}")`;

    if (!origen) {
      throw new Error(
        `${dondeEsta}: hay un elemento vacío; revisa comas de más o al final.`,
      );
    }
    if (origen.includes('*')) {
      throw new Error(`${dondeEsta}: no se permiten comodines (*).`);
    }

    let url: URL;
    try {
      url = new URL(origen);
    } catch {
      throw new Error(
        `${dondeEsta}: no es una URL válida; usa https://host[:puerto].`,
      );
    }
    if (url.protocol !== 'https:') {
      throw new Error(`${dondeEsta}: debe usar https.`);
    }
    // Un origen exacto no lleva ruta, barra final, credenciales, mayúsculas ni
    // el puerto 443 explícito: si no coincide con su forma canónica, se rechaza.
    if (origen !== url.origin) {
      throw new Error(
        `${dondeEsta}: debe ser exactamente un origen (https://host[:puerto]), sin ruta, barra final, credenciales ni mayúsculas; ¿quisiste decir "${url.origin}"?`,
      );
    }
    origenes.add(origen);
  });

  return [...origenes];
}

/** Opciones de CORS de la API para una lista de orígenes exactos. */
export function opcionesCors(origenes: string[]): CorsOptions {
  return {
    origin: origenes,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // El navegador oculta a JS las cabeceras de respuesta entre dominios salvo
    // las "simples": la web necesita el nombre del archivo de las descargas.
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  };
}
