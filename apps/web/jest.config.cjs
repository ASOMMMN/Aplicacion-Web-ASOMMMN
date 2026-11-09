/**
 * Pruebas unitarias de utilidades puras (escáner de documentos). Entorno
 * Node, sin DOM: lo que necesita canvas o Worker se prueba a mano en el
 * celular (ver docs/escaner-pruebas-manuales.md).
 */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  testEnvironment: 'node',
  transform: {
    // .tsx: vistas sin estado que se prueban con react-dom/server (sin DOM).
    '^.+\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.test.json' },
    ],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
