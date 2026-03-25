import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: true,
      proxy: {
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3000',
        },
      },
    },
  };
});
