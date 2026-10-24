import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import apiPlugin from './server/api.js'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    // Recipe/plan files are data, not source; don't reload the page when they're saved.
    watch: { ignored: ['**/recipes/**', '**/data/**'] },
  },
})
