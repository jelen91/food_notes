import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Testy nesmí sáhnout na produkční databázi; integrační testy si vyžádají MONGODB_TEST_URI samy.
    env: { NODE_ENV: 'test' },
  },
});
