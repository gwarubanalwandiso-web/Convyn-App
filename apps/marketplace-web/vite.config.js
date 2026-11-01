import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/v1': process.env.CONVYN_API_TARGET ?? 'http://127.0.0.1:4000' },
    fs: { allow: ['../..'] },
  },
  preview: {
    proxy: { '/v1': process.env.CONVYN_API_TARGET ?? 'http://127.0.0.1:4000' },
  },
  build: { sourcemap: false },
});
