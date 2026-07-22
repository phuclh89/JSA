import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: { 'import.meta.env.VITE_AUTH_MODE': JSON.stringify('development') },
  test: { globals: true, environment: 'jsdom', setupFiles: './src/test/setup.ts', css: false },
  esbuild: { jsx: 'automatic' },
});
