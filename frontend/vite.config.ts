import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/companies': 'http://localhost:3000',
      '/influencers': 'http://localhost:3000',
      '/contents': 'http://localhost:3000',
      '/media': 'http://localhost:3000',
      '/ai': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
