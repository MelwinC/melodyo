import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.js', 'shared/**/*.test.js'],
          globalSetup: ['test/pg-global-setup.js'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['client/**/*.test.{js,jsx}', 'shared/**/*.test.js'],
          setupFiles: ['client/test/setup.js'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.js', 'shared/**/*.js', 'client/src/**/*.{js,jsx}'],
      exclude: ['**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
