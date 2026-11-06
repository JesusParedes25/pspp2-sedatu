/**
 * ARCHIVO: eslint.config.js
 * PROPÓSITO: Configuración de ESLint para el backend (Node/CommonJS). Usa
 *            el set "recommended" de ESLint, que son reglas de corrección
 *            (variables/imports sin usar, referencias indefinidas, etc.),
 *            no de formato — ESLint ya no incluye reglas de estilo/formato
 *            en "recommended" desde que las movió a un plugin aparte, así
 *            que no hace falta degradarlas aquí.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // Los controllers reciben (req, res, next) por convención de Express
      // aunque una ruta puntual no use next — no es un error real.
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
