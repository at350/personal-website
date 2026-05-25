import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project site now: /personal-website/. For custom domain (alantai.org),
// set VITE_BASE=/ in the build env and add public/CNAME.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/personal-website/',
  plugins: [react()],
})
