/**
 * ARCHIVO: tailwind.config.js
 * PROPÓSITO: Configuración de Tailwind CSS con la paleta oficial de SEDATU.
 *
 * MINI-CLASE: Paleta institucional de SEDATU
 * ─────────────────────────────────────────────────────────────────
 * Los colores oficiales de SEDATU son guinda (#9f2241) y verde
 * (#235b4e). Esta configuración extiende la paleta de Tailwind
 * con variantes de ambos colores para fondos, textos, bordes y
 * hover states. El color "arena" (#DDC9A3) es complementario
 * para fondos suaves y separadores.
 * ─────────────────────────────────────────────────────────────────
 */
module.exports = {
  content: ['./index.html', './src/**/*.{jsx,js}'],
  theme: {
    extend: {
      colors: {
        guinda: {
          50:  '#f9f0f3',
          100: '#f0d5de',
          200: '#e0aabb',
          500: '#9f2241',
          600: '#7b1c3e',
          700: '#5e1530',
          800: '#420e22',
        },
        verde: {
          50:  '#f0f5f3',
          100: '#d3e6df',
          400: '#408f7e',
          500: '#235b4e',
          600: '#1c4a3f',
          700: '#153930',
        },
        arena: '#DDC9A3',
      },
    },
  },
  plugins: [],
}
