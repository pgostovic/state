import type { Config } from 'jest';

const config: Config = {
  verbose: true,
  testRegex: '/__tests__/tests\\.test\\.tsx$',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testEnvironment: 'jsdom',
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
