/**
 * ARCHIVO: auth-controller-jwt-expiracion.test.js
 * PROPÓSITO: auth.controller.js::login — la duración del JWT debe salir
 *            de JWT_EXPIRES_IN (variable de entorno), con 48h como valor
 *            por omisión cuando la variable no está definida. Antes el
 *            default era 8h y, aunque ya venía de una variable de
 *            entorno, el valor de respaldo estaba fijo en el código —
 *            esta prueba fija que el respaldo es 48h y que una variable
 *            sí definida la sobreescribe, para que ninguno de los dos
 *            vuelva a quedar hardcodeado sin que se note.
 *
 * jsonwebtoken y bcryptjs están mockeados en todo el archivo: ningún valor
 * de aquí abajo (password_hash, JWT_SECRET, password) se usa para firmar
 * ni comparar nada de verdad, son solo para que el código no tropiece con
 * un campo vacío. Por eso los nombres evitan a propósito parecer una
 * contraseña real, para que un escaneo de secretos no los marque.
 *
 * Ejecutar: npm test
 */
const USUARIO = {
  id: '00000000-0000-0000-0000-00000000c001',
  correo: 'persona@sedatu.gob.mx',
  password_hash: 'no-se-usa-bcrypt-esta-mockeado',
  rol: 'enlace',
  id_dg: null,
  id_direccion_area: null,
  nombre_completo: 'Persona de Prueba',
  cargo: 'Enlace',
  dg_siglas: null,
  dg_nombre: null,
  direccion_area_siglas: null,
  direccion_area_nombre: null,
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

const JWT_EXPIRES_IN_ORIGINAL = process.env.JWT_EXPIRES_IN;
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
  if (JWT_EXPIRES_IN_ORIGINAL === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = JWT_EXPIRES_IN_ORIGINAL;
  if (JWT_SECRET_ORIGINAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = JWT_SECRET_ORIGINAL;
});

test('sin JWT_EXPIRES_IN en el entorno, firma el token con 48h por omisión', async () => {
  delete process.env.JWT_EXPIRES_IN;
  const req = { body: { correo: USUARIO.correo, password: 'no-aplica-no-se-valida' } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    expect.objectContaining({ expiresIn: '48h' })
  );
});

test('con JWT_EXPIRES_IN definida, la usa en vez del valor por omisión', async () => {
  process.env.JWT_EXPIRES_IN = '2h';
  const req = { body: { correo: USUARIO.correo, password: 'no-aplica-no-se-valida' } };
  const res = crearRes();

  await login(req, res, jest.fn());

  expect(jwt.sign).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    expect.objectContaining({ expiresIn: '2h' })
  );
});
