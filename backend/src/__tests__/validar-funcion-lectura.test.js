/**
 * ARCHIVO: validar-funcion-lectura.test.js
 * PROPÓSITO: Fase 4/parte A del modelo de permisos (docs/modelo-permisos.md,
 *            commit 2) — prueba unitaria de la función compartida
 *            `rechazoLecturaParaInterno`
 *            (backend/src/utils/validar-funcion-lectura.js), usada desde
 *            los tres caminos que pueden terminar en `rol = 'lectura'`
 *            (ver lectura-para-interno-cerrada.test.js para la prueba
 *            por controller).
 *
 * Ejecutar: npm test
 */
const INTERNO = '00000000-0000-0000-0000-000000000e01';
const EXTERNO = '00000000-0000-0000-0000-000000000e02';

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { rechazoLecturaParaInterno } = require('../utils/validar-funcion-lectura');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation((sql, params) => {
    const id = params[0];
    const rol = id === EXTERNO ? 'externo' : 'enlace';
    return Promise.resolve({ rows: [{ rol }] });
  });
});

test('funcion distinta de "lectura": nunca rechaza, sin importar el perfil', async () => {
  expect(await rechazoLecturaParaInterno(INTERNO, 'captura')).toBeNull();
  expect(await rechazoLecturaParaInterno(INTERNO, 'responsable')).toBeNull();
  expect(await rechazoLecturaParaInterno(INTERNO, undefined)).toBeNull();
  expect(pool.query).not.toHaveBeenCalled(); // corta antes de tocar la base
});

test('funcion:"lectura" para un usuario interno: rechaza con mensaje', async () => {
  const rechazo = await rechazoLecturaParaInterno(INTERNO, 'lectura');
  expect(rechazo).not.toBeNull();
  expect(rechazo).toMatch(/solo para usuarios externos/i);
});

test('funcion:"lectura" para un usuario externo: no rechaza', async () => {
  expect(await rechazoLecturaParaInterno(EXTERNO, 'lectura')).toBeNull();
});
