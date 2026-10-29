import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import designGuard from './tools/vite-design-guard.js'

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [react(), designGuard()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})