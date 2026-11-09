/**
 * ARCHIVO: configuracion-obligatorias.test.js
 * PROPÓSITO: utils/configuracion.js. Sin JWT_SECRET el backend debe
 *            negarse a arrancar con un mensaje claro, en vez de arrancar
 *            y fallar después en el login (500) y en cada petición (401).
 *
 * Ejecutar: npm test
 */
const { variablesObligatoriasFaltantes } = require('../utils/configuracion');

test.each([
  [{}, ['JWT_SECRET']],
  [{ JWT_SECRET: '' }, ['JWT_SECRET']],
  [{ JWT_SECRET: '   ' }, ['JWT_SECRET']],
  [{ JWT_SECRET: 'a'.repeat(128) }, []],
])('%p → %p', (env, esperado) => {
  expect(variablesObligatoriasFaltantes(env)).toEqual(esperado);
});
