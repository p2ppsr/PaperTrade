import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'http', 'https', 'stream', 'buffer', 'util']
    })
  ],
  build: {
    outDir: 'build',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/healthz': 'http://localhost:3001'
    }
  }
})
