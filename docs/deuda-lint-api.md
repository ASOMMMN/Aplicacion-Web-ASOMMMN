# Deuda de lint en la API (para un PR aparte)

> Texto listo para abrir como issue. No se abrió automáticamente.

**Título:** Limpiar los errores de ESLint de `evaluaciones.service.ts` y `postulantes.service.ts` y quitar el override del CI

## Contexto

El CI de la API lintea completo cada archivo `.ts` que cambia un PR (sin `--fix`;
ver `.github/workflows/ci.yml`). Estos dos archivos tenían errores **anteriores**
a cualquier PR reciente, así que cualquier cambio en ellos bloqueaba el CI.

Se agregó en `apps/api/eslint.config.mjs` un bloque acotado a esos dos archivos
que degrada a `warn` las reglas que fallan. Los errores siguen visibles como
advertencias; solo dejan de bloquear. Ninguna regla se desactivó globalmente.

## Estado medido (al agregar el override)

| Archivo | Errores | Reglas |
|---|---|---|
| `src/modules/evaluaciones/evaluaciones.service.ts` | 131 (+4 warnings) | `no-unsafe-member-access` 72, `no-unsafe-assignment` 52, `prettier/prettier` 3, `no-unused-vars` 2, `no-unnecessary-type-assertion` 2 |
| `src/modules/postulantes/postulantes.service.ts` | 24 | `no-unsafe-member-access` 15, `no-unsafe-assignment` 8, `restrict-template-expressions` 1 |

Casi todo viene de consultas de Mongoose con `.lean()` y `any` (por ejemplo
`construirCandidatos` y `obtenerCandidato`).

## Qué hacer

1. Tipar los resultados de `.lean()` (interfaces o `LeanDocument`) en lugar de
   `any`; en `evaluaciones.service.ts` empezar por `toEvaluacionItemDto` y
   `construirCandidatos`.
2. Quitar las dos variables sin uso y las aserciones innecesarias.
3. Correr `npx prettier --write` sobre ambos archivos (en un commit aparte, solo
   formato).
4. Borrar el bloque "DEUDA TÉCNICA" de `apps/api/eslint.config.mjs`.
5. Comprobar: `npx eslint src/modules/evaluaciones/evaluaciones.service.ts src/modules/postulantes/postulantes.service.ts` sin errores ni warnings.

## Criterio de cierre

El bloque de override ya no existe y el CI pasa tocando esos archivos.

## Alcance

Sin cambios de comportamiento: solo tipos y formato. Las pruebas existentes
(`evaluaciones.service.spec.ts`, `evaluaciones.persistencia.spec.ts`,
`postulantes.nube-subida.spec.ts`) deben seguir en verde.

Esfuerzo estimado: M (unas horas, sobre todo tipar las consultas).
