import { INestApplication, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/** Una ruta HTTP de la API con lo que declara sobre acceso. */
export interface RutaApp {
  metodo: string;
  ruta: string;
  controlador: string;
  handler: string;
  /** Nombres de los guards declarados en la clase y en el método. */
  guards: string[];
  roles: string[];
  /** Metadatos sueltos del handler y la clase (p. ej. "esRutaPublica"). */
  metadatos: Record<string, unknown>;
}

const unir = (...partes: string[]) =>
  (
    '/' +
    partes
      .flatMap((p) => p.split('/'))
      .filter(Boolean)
      .join('/')
  ).replace(/\/+$/, '') || '/';

const nombreGuard = (g: unknown): string =>
  typeof g === 'function'
    ? g.name
    : ((g as { constructor?: { name?: string } })?.constructor?.name ?? '?');

/**
 * Recorre los controladores montados en la app (los mismos que atiende en
 * producción) y devuelve cada ruta con sus guards, roles y metadatos.
 */
export function listarRutas(
  app: INestApplication,
  clavesMetadatos: string[] = [],
): RutaApp[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const rutas: RutaApp[] = [];

  for (const wrapper of discovery.getControllers()) {
    const clase = wrapper.metatype as (new (...a: unknown[]) => object) | null;
    if (!clase || !wrapper.instance) continue;
    const prefijos = ([] as string[]).concat(
      (Reflect.getMetadata(PATH_METADATA, clase) as string | string[]) ?? '',
    );
    const guardsClase =
      (Reflect.getMetadata(GUARDS_METADATA, clase) as unknown[]) ?? [];
    const proto = Object.getPrototypeOf(wrapper.instance) as object;

    for (const nombre of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[nombre] as object;
      const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (metodo === undefined) continue;
      const rutasMetodo = ([] as string[]).concat(
        (Reflect.getMetadata(PATH_METADATA, handler) as string | string[]) ??
          '',
      );
      const guards = [
        ...guardsClase,
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
      ].map(nombreGuard);
      const roles =
        reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
          handler as () => void,
          clase,
        ]) ?? [];
      const metadatos = Object.fromEntries(
        clavesMetadatos.map((k) => [
          k,
          reflector.getAllAndOverride<unknown>(k, [
            handler as () => void,
            clase,
          ]),
        ]),
      );
      for (const prefijo of prefijos) {
        for (const r of rutasMetodo) {
          rutas.push({
            metodo: RequestMethod[metodo],
            ruta: unir(prefijo, r),
            controlador: clase.name,
            handler: nombre,
            guards,
            roles,
            metadatos,
          });
        }
      }
    }
  }
  return rutas.sort((a, b) =>
    `${a.ruta} ${a.metodo}`.localeCompare(`${b.ruta} ${b.metodo}`),
  );
}
