/**
 * Pruebas unitarias en Node, sin DOM: lógica pura (escáner de documentos,
 * validadores) y vistas sin estado renderizadas con react-dom/server (por eso
 * también se transforma .tsx). Lo que necesita canvas o Worker se prueba a
 * mano en el celular (ver docs/escaner-pruebas-manuales.md).
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
