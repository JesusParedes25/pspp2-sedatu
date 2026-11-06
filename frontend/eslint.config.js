/**
 * ARCHIVO: eslint.config.js
 * PROPÓSITO: Configuración de ESLint para el frontend (React + Vite).
 *            "recommended" de JS/React/React Hooks son reglas de
 *            corrección, no de formato — ESLint y estos plugins ya no
 *            traen reglas de estilo/indentado en su set recomendado, así
 *            que no hace falta degradarlas aquí. react/jsx-runtime
 *            apaga react-in-jsx-scope/jsx-uses-react: Vite usa el JSX
 *            transform automático (ver vite.config.js), no hace falta
 *            `import React` en cada archivo.
 */
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      // El proyecto no usa PropTypes ni display-name explícito en
      // ningún componente (convención ya establecida) — advertencia,
      // no error, para no exigir una migración completa de un tirón.
      'react/prop-types': 'warn',
      'react/display-name': 'warn',
      // Comillas rectas sin escapar en texto de JSX: el HTML/JSX las
      // renderiza bien tal cual, esto es preferencia de estilo, no un
      // error de funcionamiento — hay ~25 casos repartidos en todo el
      // proyecto.
      'react/no-unescaped-entities': 'warn',
      // catch {} vacío es un patrón deliberado y repetido en este
      // proyecto (localStorage en modo privado, fitBounds de un mapa
      // que puede no tener capas, un delete "mejor esfuerzo") — seguir
      // marcando cualquier OTRO bloque vacío (if/for/while/función),
      // que sí suele ser un olvido.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Convención ya usada en el proyecto: nombrar algo "_x" (o un
      // catch sin binding) es la forma explícita de decir "a propósito
      // no se usa" — sigue marcando todo lo demás.
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/__tests__/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // react-hooks/rules-of-hooks reconoce un Hook por el prefijo "use"
    // en inglés — estos dos siguen la convención en español del resto
    // del proyecto ("usar...") y por eso el plugin los trata como
    // funciones normales, marcando cada useState/useEffect de adentro
    // como "llamado fuera de un componente o Hook". Revisados a mano:
    // ninguno de los dos llama Hooks condicionalmente, es un falso
    // positivo por el nombre, no un error real.
    files: ['src/hooks/usarCapturaCategorias.js', 'src/hooks/usarCapturaValorIndicador.js'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // Los specs de e2e corren bajo Node (Playwright), pero los callbacks
    // de page.evaluate()/page.evaluateHandle() se serializan y ejecutan
    // DENTRO del navegador — de ahí los globals de browser también aquí.
    files: ['e2e/**/*.js', 'playwright.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['*.config.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
