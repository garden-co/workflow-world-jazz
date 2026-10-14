import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/conformance.test.ts'],
    // Every test spawns a server that registers its own webhooks.
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
