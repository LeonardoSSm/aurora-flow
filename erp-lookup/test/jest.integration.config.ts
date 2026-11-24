import type { Config } from 'jest';

/**
 * Contra o MySQL do profile erp-dev (`docker compose --profile erp-dev up -d erp-mysql-dev`),
 * que já sobe com erp-lookup/dev/seed.sql. Host/porta/senha podem ser trocados por
 * ERP_DB_HOST, ERP_DB_PORT e ERP_DB_PASSWORD.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/integration/.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 20000,
};

export default config;
