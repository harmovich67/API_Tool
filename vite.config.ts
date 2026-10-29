import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error ESM server module
import { createProxyMiddleware } from './server/proxyEngine.mjs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'nexus-api-proxy-engine',
      configureServer(server) {
        server.middlewares.use(createProxyMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createProxyMiddleware());
      },
    },
  ],
  server: {
    port: 4080,
    host: true,
  },
});

