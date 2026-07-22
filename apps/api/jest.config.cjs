module.exports = {
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  testEnvironment: 'node',
};
