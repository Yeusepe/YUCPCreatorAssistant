import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@yucp\/shared$/,
        replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
      {
        find: /^@yucp\/shared\/(.*)$/,
        replacement: path.resolve(__dirname, '../../packages/shared/src/$1.ts'),
      },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['test/unit/setup.ts'],
  },
});
