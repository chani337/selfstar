import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true,
    port: 5174,

    // ✅ 여기 추가: .env 에서 불러오기
    allowedHosts: [process.env.VITE_ALLOWED_HOST || 'localhost'],

    proxy: {
      '/auth': { target: 'http://backend:8000', changeOrigin: true, secure: false },
      '/api': { target: 'http://backend:8000', changeOrigin: true, secure: false },
      '/users': { target: 'http://backend:8000', changeOrigin: true, secure: false },
      '/user': { target: 'http://backend:8000', changeOrigin: true, secure: false }, // legacy
      '/personas': { target: 'http://backend:8000', changeOrigin: true, secure: false },
      '/media': { target: 'http://backend:8000', changeOrigin: true, secure: false },
    },
  },
})

