import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
}));
