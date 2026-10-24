import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // Audit artefacts and build output must not trigger HMR reloads.
      ignored: ['**/.smoke/**', '**/dist/**'],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        // Keep the WebGL stack and the charting stack in their own chunks so a
        // route that needs neither (HISTORY, SIMULATION) never downloads them.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: true,
    reporters: 'default',
  },
});
