/**
 * ARCHIVO: postcss.config.js
 * PROPÓSITO: Configuración de PostCSS para procesar Tailwind CSS.
 *
 * MINI-CLASE: PostCSS y el pipeline de CSS
 * ─────────────────────────────────────────────────────────────────
 * PostCSS es un procesador de CSS que ejecuta plugins en cadena.
 * tailwindcss genera las clases utilitarias a partir de la config.
 * autoprefixer agrega prefijos de navegador (-webkit-, -moz-) para
 * compatibilidad. Vite ejecuta este pipeline automáticamente al
 * detectar este archivo en la raíz del proyecto.
 * ─────────────────────────────────────────────────────────────────
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
