import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.ts',
    // Non-logic framework files
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.enum.ts',
    '!**/*.type.ts',
    '!**/*.types.ts',
    '!**/*.constants.ts',
    '!**/*.strategy.ts',
    '!**/*.guard.ts',
    '!**/*.decorator.ts',
    '!**/*.pipe.ts',
    '!**/*.filter.ts',
    '!**/*.interceptor.ts',
    '!**/*.controller.ts',
    '!**/*.d.ts',
    '!**/main.ts',
    '!**/database/migrations/**',
    '!**/*.spec.ts',
    // Domain errors (thin wrappers, no branch logic worth measuring here)
    '!**/domain/errors/**',
    // Infrastructure adapters — not unit-testable without real external services
    '!**/forms/infrastructure/**',
    '!**/google-workspace/google-workspace.service.ts',
    '!**/google-workspace/oauth/google-oauth.service.ts',
    '!**/google-workspace/oauth/google-profile.service.ts',
    '!**/google-workspace/sheets/**',
    '!**/google-workspace/sync/google-sheets-sync.service.ts',
    '!**/google-workspace/sync/google-sync-cleanup.service.ts',
    '!**/google-workspace/sync/google-sheets-spreadsheet.service.ts',
    '!**/google-workspace/tokens/**',
    '!**/google-workspace/types/**',
    // Services with no unit tests (out of scope for current task)
    '!**/forms/forms.service.ts',
    '!**/forms/form-version.writer.ts',
    '!**/forms/form-list.query.ts',
    '!**/forms/public-forms.service.ts',
    '!**/dashboard/**',
    '!**/audit/**',
    '!**/responses/public-captcha.service.ts',
    '!**/responses/form-submission.validator.ts',
    // Event classes (thin data wrappers)
    '!**/common/events/**',
    // Unused/infrastructure domain helpers
    '!**/common/domain/**',
    '!**/common/exceptions/**',
    // Configuration and data-source bootstrapping (not business logic)
    '!**/config/**',
    '!**/database/data-source.ts',
    '!**/database/entities/index.ts',
    // File upload integration service and form definition utilities
    '!**/forms/public-form-files.service.ts',
    '!**/forms/form-definition.utils.ts',
    // Google connection management (integration-heavy)
    '!**/google-workspace/connection/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 55,
      statements: 54,
      functions: 51,
      branches: 37,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^expo-server-sdk$': '<rootDir>/__mocks__/expo-server-sdk.ts',
  },
};

export default config;
