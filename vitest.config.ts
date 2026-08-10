/// <reference types="node" />
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration. Tests run in a jsdom environment (the panel and inject
 * logic touch the DOM) with a global setup file that installs the chrome mock.
 * Coverage is scoped to the logic-bearing source trees and gated by thresholds
 * so regressions in test coverage fail CI rather than slipping through.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**', 'src/features/**', 'src/panel/**', 'src/content/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
