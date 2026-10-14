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
      fontFamily: {
        sans: ['Noto Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        base: ['16px', { lineHeight: '1.428' }],
      },
      colors: {
        /* ── SEDATU guinda (primary) ── */
        guinda: {
          50:  '#fbf3f6',
          100: '#f0d5de',
          200: '#e0aabb',
          500: '#7b1c3e',   /* PRIMARY: SEDATU institutional #7B1C3E */
          600: '#611232',   /* hover / active */
          700: '#4e0e27',   /* sidebar background */
          800: '#3a0a1d',
        },
        /* ── Accent (gob.mx official) ── */
        dorado:    '#A57F2C',
        'dorado-claro': '#DDC9A3',
        bronce:    '#BC955C',
        arena:     '#DDC9A3',  /* backwards-compat alias */
        /* ── Institutional green (gob.mx) ── */
        'verde-institucional': '#13322E',
        verde: {
          50:  '#f0f5f3',
          100: '#d3e6df',
          400: '#408f7e',
          500: '#235b4e',
          600: '#1c4a3f',
          700: '#153930',
        },
        /* ── Neutrals (gob.mx standard) ── */
        texto:      '#545454',   /* body text */
        gris:       '#98989A',   /* muted / labels */
        'gris-claro': '#E5E5E5', /* borders / dividers */
        fondo:      '#F5F5F0',   /* page background */
        /* ── Semantic (keep as-is) ── */
        'verde-success': '#16A34A',
        'ambar-warning': '#D97706',
        'rojo-danger':   '#DC2626',
        'gris-neutral':  '#94A3B8',
      },
    },
  },
  plugins: [],
}
