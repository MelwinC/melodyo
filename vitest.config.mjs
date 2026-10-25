import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.js'],
          globalSetup: ['test/pg-global-setup.js'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['client/**/*.test.{js,jsx}'],
          setupFiles: ['client/test/setup.js'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.js', 'client/src/**/*.{js,jsx}'],
      exclude: ['**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'text'],
    },
  },
});
