/**
 * ARCHIVO: sesion-inactividad-revocacion.test.js
 * PROPÓSITO: Paso 5 (sesión por inactividad, almacén de sesión y
 *            revocación) — casos pedidos explícitamente:
 *              1. token expirado rechazado
 *              2. renovación con token válido
 *              3. renovación con token expirado rechazada
 *              4. renovación más allá del techo absoluto rechazada
 *              5. una cuenta desactivada pierde el acceso sin esperar a
 *                 que expire (incluye el caso general de token_version
 *                 revocado, del que "cuenta desactivada" es un caso)
 *            (el caso "la conexión de notificaciones no renueve la
 *            sesión" es de frontend — ver
 *            frontend/src/hooks/__tests__/useSesionActividad.test.js)
 *
 * Se arma la app con las rutas REALES de auth (routes/auth.routes.js),
 * igual que boleto-archivo.test.js hace con las de archivos. Se firman
 * los tokens a mano con jsonwebtoken (no se pasa por /auth/login) para
 * controlar con precisión `iat`/`exp`/`tv` sin depender de relojes
 * reales ni de esperar horas de verdad.
 *
 * Ejecutar: npm test
 */
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'secreto-de-prueba-sesion';
process.env.JWT_INACTIVIDAD_HORAS = '8';
process.env.JWT_SESION_MAX_HORAS = '72';

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { verificarToken } = require('../middleware/auth.middleware');
const authRoutes = require('../routes/auth.routes');

const USUARIO = {
  id: 'u-1',
  correo: 'persona@example.org',
  rol: 'enlace',
  id_dg: null,
  id_direccion_area: null,
  nombre_completo: 'Persona de Prueba',
  activo: true,
  token_version: 0,
};

let servidor;
let base;
let filaUsuario; // lo que devuelve el SELECT de auth.middleware.js — mutable por prueba

beforeAll((hecho) => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.get('/protegido', verificarToken, (req, res) => res.json({ id: req.usuario.id }));
  app.use((err, req, res, _next) => res.status(500).json({ error: true, mensaje: err.message }));
  servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; hecho(); });
});
afterAll((hecho) => { servidor.close(hecho); });

beforeEach(() => {
  jest.clearAllMocks();
  filaUsuario = { ...USUARIO };
  pool.query.mockImplementation((sql) => {
    if (/FROM usuarios WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: filaUsuario ? [filaUsuario] : [] });
    }
    return Promise.resolve({ rows: [] });
  });
});

function firmar(payload, opciones) {
  return jwt.sign(payload, process.env.JWT_SECRET, opciones);
}

function tokenValido({ tv = 0 } = {}) {
  return firmar(
    { id: USUARIO.id, correo: USUARIO.correo, rol: USUARIO.rol, id_dg: null, id_direccion_area: null, nombre_completo: USUARIO.nombre_completo, tv, ini: Math.floor(Date.now() / 1000) },
    { expiresIn: 8 * 3600 }
  );
}

function tokenExpirado() {
  return firmar(
    { id: USUARIO.id, correo: USUARIO.correo, rol: USUARIO.rol, id_dg: null, id_direccion_area: null, nombre_completo: USUARIO.nombre_completo, tv: 0 },
    { expiresIn: -10 } // exp ya quedó en el pasado
  );
}

// Firma directa, sin pasar por login/renovar: simula un token cuyo `ini`
// (inicio real de la sesión) es más viejo que el techo absoluto, pero
// cuyo `exp` (el reloj de inactividad) todavía no vence — es exactamente
// el caso que renovarToken tiene que negar aparte de la expiración normal.
function tokenMasAlladelTecho() {
  const ahora = Math.floor(Date.now() / 1000);
  const techoSegundos = 72 * 3600;
  return firmar(
    {
      id: USUARIO.id, correo: USUARIO.correo, rol: USUARIO.rol, id_dg: null, id_direccion_area: null,
      nombre_completo: USUARIO.nombre_completo, tv: 0,
      ini: ahora - techoSegundos - 100,
    },
    { expiresIn: 60 }
  );
}

describe('1. token expirado rechazado', () => {
  test('GET /protegido con token expirado → 401 AUTH_TOKEN_EXPIRED', async () => {
    const r = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${tokenExpirado()}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_TOKEN_EXPIRED');
  });
});

describe('2. renovación con token válido', () => {
  test('POST /auth/renovar con token vigente → 200, token nuevo y expiraEn', async () => {
    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${tokenValido()}` } });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(typeof cuerpo.datos.token).toBe('string');
    expect(cuerpo.datos.token.length).toBeGreaterThan(0);
    expect(new Date(cuerpo.datos.expiraEn).getTime()).toBeGreaterThan(Date.now());

    // El token nuevo también sirve para entrar — preserva id/tv.
    const r2 = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${cuerpo.datos.token}` } });
    expect(r2.status).toBe(200);
  });

  test('el token renovado preserva `ini` (no reinicia el techo absoluto)', async () => {
    const original = tokenValido();
    const { ini: iniOriginal } = jwt.decode(original);

    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${original}` } });
    const { token: renovado } = (await r.json()).datos;
    const { ini: iniRenovado } = jwt.decode(renovado);

    expect(iniRenovado).toBe(iniOriginal);
  });
});

describe('3. renovación con token expirado rechazada', () => {
  test('POST /auth/renovar con token expirado → 401, nunca llega a emitir uno nuevo', async () => {
    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${tokenExpirado()}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_TOKEN_EXPIRED');
  });
});

describe('4. renovación más allá del techo absoluto rechazada', () => {
  test('POST /auth/renovar con sesión más vieja que JWT_SESION_MAX_HORAS → 401 AUTH_SESSION_MAX_AGE', async () => {
    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${tokenMasAlladelTecho()}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_SESSION_MAX_AGE');
  });

  test('justo por debajo del techo, la renovación sí se concede', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const token = firmar(
      { id: USUARIO.id, correo: USUARIO.correo, rol: USUARIO.rol, id_dg: null, id_direccion_area: null, nombre_completo: USUARIO.nombre_completo, tv: 0, ini: ahora - 72 * 3600 + 60 },
      { expiresIn: 60 }
    );
    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200);
  });
});

describe('5. cuenta desactivada / sesión revocada pierde el acceso sin esperar a que expire', () => {
  test('cuenta desactivada después de emitido el token → 401 AUTH_SESSION_REVOKED en la siguiente petición', async () => {
    const token = tokenValido();
    const r1 = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r1.status).toBe(200); // la cuenta todavía estaba activa

    filaUsuario = { ...USUARIO, activo: false }; // el superadmin la desactiva

    const r2 = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r2.status).toBe(401);
    expect((await r2.json()).codigo).toBe('AUTH_SESSION_REVOKED');
  });

  test('token_version revocado (cambio de contraseña, p. ej.) → 401 AUTH_SESSION_REVOKED aunque el token no haya expirado', async () => {
    const token = tokenValido({ tv: 0 });
    filaUsuario = { ...USUARIO, token_version: 1 }; // se restableció la contraseña: token_version subió

    const r = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_SESSION_REVOKED');
  });

  test('usuario eliminado por completo (sin fila) → 401 AUTH_SESSION_REVOKED, no 500', async () => {
    const token = tokenValido();
    filaUsuario = null;

    const r = await fetch(`${base}/protegido`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_SESSION_REVOKED');
  });

  test('también la revocación se verifica en la renovación, no solo en las peticiones normales', async () => {
    const token = tokenValido();
    filaUsuario = { ...USUARIO, activo: false };

    const r = await fetch(`${base}/auth/renovar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('AUTH_SESSION_REVOKED');
  });
});
