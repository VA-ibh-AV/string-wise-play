import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const pkg = (name: string) => ({
  find: new RegExp(`^@play/${name}$`),
  replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
});

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: ['engine', 'three-kit', 'audio', 'ui', 'progress'].map(pkg),
  },
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
  },
});
