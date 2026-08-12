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
  // Ruta base donde se sirve la app. Producción hoy vive en la raíz del
  // dominio, así que el default es '/' y el build de prod no necesita
  // tocarse. Antes esto era `NODE_ENV === 'production' ? '/pspp/' : '/'`
  // (preparación para una eventual migración a
  // sistemas.sedatu.gob.mx/pspp/), lo que obligaba a editar este archivo
  // en el servidor tras cada `git pull` — y ese cambio local sin commitear
  // hacía fallar el pull siguiente. Si algún día la app sí se sirve bajo
  // un subpath, se define VITE_BASE_PATH=/pspp/ en el entorno del build
  // (docker-compose.prod.yml → servicio frontend-build) en vez de editar
  // código. El router lee este mismo valor vía import.meta.env.BASE_URL
  // (ver main.jsx), así que los dos quedan sincronizados solos.
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    // El Diagrama (VistaDiagrama, cargado vía React.lazy en
    // DetalleProyecto.jsx) ya forma su propio chunk lazy de forma
    // automática por ser un import() dinámico — no hace falta
    // manualChunks para eso. Hubo un intento de agrupar @xyflow/react +
    // d3-hierarchy en un chunk 'vendor-diagrama' nombrado explícitamente
    // (para que cachearan aparte), pero @xyflow/react importa 'react-dom'
    // por su entrada clásica (createPortal), distinta del archivo
    // 'react-dom/client' que usa main.jsx — Rollup, al forzar ese chunk,
    // terminaba metiendo ahí TODO lo que solo era alcanzable desde
    // @xyflow, incluyendo React/ReactDOM/Scheduler completos, y el chunk
    // principal (main.jsx) pasaba a importar createRoot/hydrateRoot
    // *desde* ese chunk — es decir, el chunk "solo para el Diagrama" se
    // descargaba y ejecutaba en TODA carga de página, no solo al abrir
    // el Diagrama. Eso producía crashes intermitentes tipo "Cannot read
    // properties of undefined (reading 'length')" en código interno de
    // React/Scheduler al navegar. Sin manualChunks, Vite vuelve a poner
    // React/ReactDOM en el chunk principal (se necesitan de entrada) y
    // @xyflow/d3-hierarchy quedan solo en el chunk lazy real del Diagrama.
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
