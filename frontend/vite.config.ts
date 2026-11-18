import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the browser talks only to the Vite server; /api is proxied to the
// backend with the prefix stripped, mirroring nginx in production. That keeps
// the session cookie same-origin and gives Google a stable redirect URI.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
});
