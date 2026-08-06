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
  build: {
    rollupOptions: {
      output: {
        // El Diagrama ya carga @xyflow/react + d3-hierarchy vía React.lazy
        // (no entran al bundle inicial), pero sin esto Rollup podía repartir
        // sus módulos entre distintos chunks dinámicos según qué más se
        // importe junto — agruparlos explícito en su propio vendor chunk
        // los mantiene juntos y cacheables por separado del resto del app.
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/d3-')) {
            return 'vendor-diagrama';
          }
        },
      },
    },
    // Darle nombre propio a ese chunk (arriba) hace que Vite lo trate como
    // "vendor" y le agregue un <link rel="modulepreload"> en el index.html
    // — es decir, TODOS los usuarios lo descargarían de fondo en cada carga
    // inicial, aunque nunca abran el Diagrama. Se excluye explícitamente
    // para que solo se pida cuando el React.lazy() realmente lo necesita.
    modulePreload: {
      resolveDependencies: (filename, deps) => deps.filter(d => !d.includes('vendor-diagrama')),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://backend:3000' },
    // Docker Desktop en Windows no siempre propaga eventos de filesystem
    // nativos al bind mount ./frontend/src → /app/src, así que chokidar se
    // queda sin detectar cambios y Vite sirve una versión cacheada del
    // módulo. Con polling forzamos a que revise el contenido en disco.
    watch: { usePolling: true, interval: 300 }
  }
})
