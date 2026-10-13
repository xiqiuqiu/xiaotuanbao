/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.(e2e|integration)-spec.ts$',
  // Concurrent finance / allocation suites exceed Jest's 5s default on CI runners.
  testTimeout: 30_000,
  globalSetup: '<rootDir>/test/support/e2e-database-consumer-lease.ts',
  globalTeardown: '<rootDir>/test/support/e2e-database-consumer-release.ts',
  setupFiles: ['<rootDir>/test/support/require-isolated-e2e-database.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@xiaotuanbao/ai-contracts$': '<rootDir>/../../packages/ai-contracts/src/index.ts',
    '^@xiaotuanbao/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
}
