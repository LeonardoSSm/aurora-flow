import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/integration/.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/integration/setup-env.ts'],
  // Padrão do Jest (5s) já não basta pro beforeAll: reset de schema + bootstrap
  // completo do AppModule (sync + todas as migrations) cresce junto com o projeto.
  testTimeout: 60000
};

export default config;
