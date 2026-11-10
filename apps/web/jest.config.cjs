/**
 * Pruebas unitarias en Node, sin DOM: lógica pura y vistas sin estado
 * renderizadas con react-dom/server (por eso también se transforma .tsx).
 */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  testEnvironment: 'node',
  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.test.json' },
    ],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
