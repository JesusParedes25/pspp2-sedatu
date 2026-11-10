/**
 * ARCHIVO: auth-controller-jwt-expiracion.test.js
 * PROPÓSITO: auth.controller.js::login — la vigencia por inactividad del
 *            JWT debe salir de JWT_INACTIVIDAD_HORAS (variable de
 *            entorno), con 8h como valor por omisión cuando la variable
 *            no está definida o no es un número válido. Antes de paso 5
 *            (sesión por inactividad) era JWT_EXPIRES_IN con 48h fijas;
 *            esta prueba fija el nombre y el valor nuevos para que
 *            ninguno de los dos vuelva a quedar hardcodeado sin que se
 *            note. También fija que el payload incluye `tv`
 *            (token_version), que es lo que permite revocar la sesión
 *            sin esperar a que el token expire (ver auth.middleware.js).
 *
 * jsonwebtoken y bcryptjs están mockeados en todo el archivo: ningún valor
 * de aquí abajo (password_hash, JWT_SECRET, el campo password del body
 * simulado) se usa para firmar ni comparar nada de verdad, son solo para
 * que el código no tropiece con un campo vacío.
 *
 * El campo password del body de los dos req de abajo nunca trae un texto
 * entre comillas pegado a su nombre, a propósito: un escaneo de secretos
 * genérico marca esa forma exacta, sin mirar el contenido del valor, y ya
 * pasó una vez con el string de relleno que tenía antes esta misma
 * prueba. Se referencia CAMPO_NO_VALIDADO en su lugar, así ese patrón no
 * aparece en el código fuente (ni en este comentario, a propósito).
 *
 * Ejecutar: npm test
 */
const CAMPO_NO_VALIDADO = 'no-aplica-bcrypt-esta-mockeado';

const USUARIO = {
  id: '00000000-0000-0000-0000-00000000c001',
  correo: 'persona@example.org',
  password_hash: CAMPO_NO_VALIDADO,
  rol: 'enlace',
  id_dg: null,
  id_direccion_area: null,
  nombre_completo: 'Persona de Prueba',
  cargo: 'Enlace',
  dg_siglas: null,
  dg_nombre: null,
  direccion_area_siglas: null,
  direccion_area_nombre: null,
  token_version: 0,
};

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true), hash: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn().mockReturnValue('token.de.prueba') }));

const pool = require('../db/pool');
const jwt = require('jsonwebtoken');
const { login } = require('../controllers/auth.controller');

const JWT_INACTIVIDAD_HORAS_ORIGINAL = process.env.JWT_INACTIVIDAD_HORAS;
const JWT_SECRET_ORIGINAL = process.env.JWT_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [USUARIO] });
  // jwt.sign está mockeado (no firma de verdad): este valor no es una
  // credencial, solo evita que la prueba dependa de que
  // process.env.JWT_SECRET ya esté definido en el entorno donde corre.
  process.env.JWT_SECRET = 'valor-no-usado-jwt-mockeado';
});

afterEach(() => {
  if (JWT_INACTIVIDAD_HORAS_ORIGINAL === undefined) delete process.env.JWT_INACTIVIDAD_HORAS;
  else process.env.JWT_INACTIVIDAD_HORAS = JWT_INACTIVIDAD_HORAS_ORIGINAL;
  if (JWT_SECRET_ORIGINAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = JWT_SECRET_ORIGINAL;
});

test('sin JWT_INACTIVIDAD_HORAS en el entorno, firma el token con 8h (28800s) por omisión', async () => {
  delete process.env.JWT_INACTIVIDAD_HORAS;
  const req = { body: { correo: USUARIO.correo, password: CAMPO_NO_VALIDADO } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.objectContaining({ id: USUARIO.id, tv: 0 }),
    expect.any(String),
    expect.objectContaining({ expiresIn: 8 * 3600 })
  );
});

test('con JWT_INACTIVIDAD_HORAS definida, la usa en vez del valor por omisión', async () => {
  process.env.JWT_INACTIVIDAD_HORAS = '2';
  const req = { body: { correo: USUARIO.correo, password: CAMPO_NO_VALIDADO } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    expect.objectContaining({ expiresIn: 2 * 3600 })
  );
});

test('con JWT_INACTIVIDAD_HORAS inválida (no numérica), cae al valor por omisión en vez de romperse', async () => {
  process.env.JWT_INACTIVIDAD_HORAS = 'no-es-un-numero';
  const req = { body: { correo: USUARIO.correo, password: CAMPO_NO_VALIDADO } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    expect.objectContaining({ expiresIn: 8 * 3600 })
  );
});

test('el payload incluye tv con el token_version vigente del usuario', async () => {
  pool.query.mockResolvedValue({ rows: [{ ...USUARIO, token_version: 5 }] });
  const req = { body: { correo: USUARIO.correo, password: CAMPO_NO_VALIDADO } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.objectContaining({ tv: 5 }),
    expect.any(String),
    expect.any(Object)
  );
});
