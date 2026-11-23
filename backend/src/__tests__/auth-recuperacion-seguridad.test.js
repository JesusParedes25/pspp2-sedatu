/**
 * ARCHIVO: auth-recuperacion-seguridad.test.js
 * PROPÓSITO: auth.controller.js::solicitarRecuperacion — antes de paso 8
 *            DGTIC, este endpoint devolvía el token de restablecimiento
 *            (como `reset_link` completo) directamente en la respuesta
 *            JSON a un llamador SIN AUTENTICACIÓN: cualquiera que
 *            conociera un correo registrado podía pedir la recuperación
 *            y leer el enlace ahí mismo, tomando la cuenta sin acceso al
 *            buzón — y, antes de eso, el solo hecho de que la respuesta
 *            tuviera o no los campos `enviar`/`reset_link` ya revelaba si
 *            ese correo estaba registrado.
 *
 * Esta prueba fija el arreglo: la respuesta es SIEMPRE el mismo acuse
 * genérico (mismas claves, mismo valor), exista o no la cuenta — nunca
 * trae `token`, `reset_link`, `enviar`, `nombre` ni `correo` — y el
 * correo (con el enlace) se genera, guarda y manda enteramente en el
 * servidor, solo cuando la cuenta existe.
 *
 * Ejecutar: npm test
 */
function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');

jest.mock('../utils/correo', () => ({ enviarCorreo: jest.fn().mockResolvedValue({ enviado: true }) }));
const { enviarCorreo } = require('../utils/correo');

const { solicitarRecuperacion } = require('../controllers/auth.controller');

const USUARIO = {
  id: '00000000-0000-0000-0000-00000000f001',
  nombre_completo: 'Persona Registrada',
  correo: 'persona@example.org',
};

function req(correo) {
  return { body: { correo } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('correo registrado: acuse genérico en la respuesta, nada de token/enlace/nombre/correo', async () => {
  pool.query.mockImplementation((sql) => {
    if (/SELECT id, nombre_completo, correo FROM usuarios/.test(sql)) {
      return Promise.resolve({ rows: [USUARIO] });
    }
    if (/INSERT INTO tokens_activacion/.test(sql)) return Promise.resolve({ rows: [] });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  const res = crearRes();

  await solicitarRecuperacion(req('persona@example.org'), res, jest.fn());

  const payload = res.json.mock.calls[0][0];
  expect(Object.keys(payload)).toEqual(['mensaje']);
  expect(payload.token).toBeUndefined();
  expect(payload.reset_link).toBeUndefined();
  expect(payload.enviar).toBeUndefined();
  expect(payload.nombre).toBeUndefined();
  expect(payload.correo).toBeUndefined();
});

test('correo NO registrado: exactamente la misma respuesta (mismas claves, mismo mensaje)', async () => {
  const resEncontrado = crearRes();
  const resNoEncontrado = crearRes();

  pool.query.mockImplementation((sql) => {
    if (/SELECT id, nombre_completo, correo FROM usuarios/.test(sql)) return Promise.resolve({ rows: [USUARIO] });
    if (/INSERT INTO tokens_activacion/.test(sql)) return Promise.resolve({ rows: [] });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  await solicitarRecuperacion(req('persona@example.org'), resEncontrado, jest.fn());

  pool.query.mockImplementation((sql) => {
    if (/SELECT id, nombre_completo, correo FROM usuarios/.test(sql)) return Promise.resolve({ rows: [] });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  await solicitarRecuperacion(req('no-existe@example.org'), resNoEncontrado, jest.fn());

  expect(resEncontrado.json.mock.calls[0][0]).toEqual(resNoEncontrado.json.mock.calls[0][0]);
  expect(resEncontrado.status).not.toHaveBeenCalledWith(404);
  expect(resNoEncontrado.status).not.toHaveBeenCalledWith(404);
});

test('correo registrado: el token se guarda y el aviso se manda por correo en el servidor, nunca al navegador', async () => {
  pool.query.mockImplementation((sql) => {
    if (/SELECT id, nombre_completo, correo FROM usuarios/.test(sql)) {
      return Promise.resolve({ rows: [USUARIO] });
    }
    if (/INSERT INTO tokens_activacion/.test(sql)) return Promise.resolve({ rows: [] });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  const res = crearRes();

  await solicitarRecuperacion(req('persona@example.org'), res, jest.fn());

  expect(pool.query).toHaveBeenCalledWith(
    expect.stringMatching(/INSERT INTO tokens_activacion/),
    expect.arrayContaining([USUARIO.id, expect.any(String)])
  );
  expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ para: USUARIO.correo }));
});

test('correo NO registrado: no inserta token ni manda correo', async () => {
  pool.query.mockImplementation((sql) => {
    if (/SELECT id, nombre_completo, correo FROM usuarios/.test(sql)) return Promise.resolve({ rows: [] });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
  const res = crearRes();

  await solicitarRecuperacion(req('no-existe@example.org'), res, jest.fn());

  expect(enviarCorreo).not.toHaveBeenCalled();
});
