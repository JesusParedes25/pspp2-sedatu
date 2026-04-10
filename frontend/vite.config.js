/**
 * ARCHIVO: vite.config.js
 * PROPÓSITO: Configuración de Vite para el frontend React de PSPP.
 *
 * MINI-CLASE: Vite como bundler de desarrollo
 * ─────────────────────────────────────────────────────────────────
 * Vite usa ES modules nativos del navegador en desarrollo, lo que
 * hace que el servidor arranque en milisegundos (vs webpack que
 * bundlea todo antes de arrancar). El proxy redirige peticiones
 * /api al backend en desarrollo para evitar problemas de CORS.
 * En producción, Nginx maneja el proxy directamente.
 * ─────────────────────────────────────────────────────────────────
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/pspp/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://backend:3000' }
  }
})
