import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@kitiumai/error': resolve(__dirname, './tests/shims/kitium-error.ts'),
      '@kitiumai/logger': resolve(__dirname, './tests/shims/logger.ts'),
    },
  },
});
