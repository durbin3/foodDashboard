import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import apiPlugin from './server/api.js'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    // An explicit IPv4 address: "localhost" made Vite listen on [::1] only, and
    // browsers that try 127.0.0.1 first stall ~1-2s per new connection on Windows.
    host: '127.0.0.1',
    // Recipe/plan files are data, not source; don't reload the page when they're saved.
    watch: { ignored: ['**/recipes/**', '**/data/**'] },
  },
})
