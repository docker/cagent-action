import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Mirror the tsup `define` so that tests running against TypeScript source
// (via Vitest) see the same compile-time constant as the bundled output.
const dockerAgentVersion = readFileSync(
  resolve(import.meta.dirname, 'DOCKER_AGENT_VERSION'),
  'utf-8',
).trim();

export default defineConfig({
  define: {
    __DOCKER_AGENT_VERSION__: JSON.stringify(dockerAgentVersion),
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.ts'],
          exclude: ['src/**/__tests__/**/*.integration.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/__tests__/**/*.integration.test.ts'],
        },
      },
    ],
  },
});
