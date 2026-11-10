/**
 * ARCHIVO: boleto-archivo.test.js
 * PROPÓSITO: Boleto efímero de archivo (utils/boletoArchivo.js,
 *            autenticarArchivo en middleware/auth.middleware.js), que
 *            sustituye al token de sesión en la URL de descarga.
 *
 * Casos pedidos: boleto válido, boleto expirado (401, no 500), boleto de
 * otro objeto, boleto usado como token de sesión y token de sesión usado
 * como boleto. Más: acción cruzada (ver ↔ descargar), tipo cruzado
 * (evidencia ↔ actividad), firma alterada, vigencia configurable y que la
 * emisión exige la cabecera normal.
 *
 * Se arma la app con las rutas REALES en el mismo orden que
 * routes/index.js: primero las de transmisión (archivos.routes.js, que
 * aceptan boleto), luego verificarToken, luego el resto. Solo se simulan
 * la BD, los permisos de proyecto y el almacén.
 *
 * Ejecutar: npm test
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');

process.env.JWT_SECRET = 'secreto-de-prueba-boletos';
delete process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS;

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../utils/autorizacion', () => ({
  ...jest.requireActual('../utils/autorizacion'),
  puedeVerProyecto: jest.fn(),
  obtenerProyectoIdDeNodo: jest.fn(),
}));
const mockAlmacen = { statObject: jest.fn(), getObject: jest.fn(), getPartialObject: jest.fn(), removeObject: jest.fn() };
jest.mock('../utils/minio', () => ({
  minioClient: { bucketExists: jest.fn().mockResolvedValue(true), makeBucket: jest.fn() },
  BUCKET: 'b',
  almacen: mockAlmacen,
  esObjetoInexistente: (err) => err?.code === 'NotFound' || err?.code === 'NoSuchKey',
}));
jest.mock('../db/queries/evidencias.queries', () => ({ obtenerEvidenciaPorId: jest.fn() }));
jest.mock('../db/queries/actividad.queries', () => ({
  ...jest.requireActual('../db/queries/actividad.queries'),
  obtenerAdjuntoActividad: jest.fn(),
}));

const pool = require('../db/pool');
const autorizacion = require('../utils/autorizacion');
const evidenciasQueries = require('../db/queries/evidencias.queries');
const actividadQueries = require('../db/queries/actividad.queries');
const { verificarToken } = require('../middleware/auth.middleware');
const { emitirBoleto, verificarBoleto, vigenciaSegundos } = require('../utils/boletoArchivo');

const EV_A = '11111111-1111-1111-1111-111111111111';
const EV_B = '22222222-2222-2222-2222-222222222222';
const ACT_A = '33333333-3333-3333-3333-333333333333';
const USUARIO = { id: 'u-1', rol: 'operativo', id_dg: 7, id_direccion_area: null };
const SESION = jwt.sign({ ...USUARIO, correo: 'u1@ejemplo.org', nombre_completo: 'Usuaria Uno' }, process.env.JWT_SECRET, { expiresIn: '48h' });

let servidor;
let base;
beforeAll((hecho) => {
  const app = express();
  app.use(express.json());
  app.use(require('../routes/archivos.routes'));
  app.use(verificarToken);
  app.use('/evidencias', require('../routes/evidencias.routes'));
  app.use('/actividad', require('../routes/actividad.routes'));
  // Cualquier otro endpoint autenticado de la API.
  app.get('/yo', (req, res) => res.json({ id: req.usuario.id }));
  app.use((err, req, res, _next) => res.status(500).json({ error: true, mensaje: err.message }));
  servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; hecho(); });
});
afterAll((hecho) => { servidor.close(hecho); });

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  delete process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS;
  pool.query.mockImplementation((sql) => {
    if (/FROM evidencias WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_etapa: null, id_accion: 'acc-1', id_subaccion: null, id_riesgo: null }] });
    }
    if (/FROM actividad WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [{ id_proyecto: 'proyecto-1' }] });
    // auth.middleware.js::cargarUsuarioSesion — confirma activo/token_version
    // en cada petición autenticada (ver 087_sesion_token_version.sql).
    if (/FROM usuarios WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ ...USUARIO, correo: 'u1@ejemplo.org', nombre_completo: 'Usuaria Uno', activo: true, token_version: 0 }] });
    }
    return Promise.resolve({ rows: [] });
  });
  autorizacion.obtenerProyectoIdDeNodo.mockResolvedValue('proyecto-1');
  autorizacion.puedeVerProyecto.mockResolvedValue(true);
  evidenciasQueries.obtenerEvidenciaPorId.mockImplementation(async (id) => ({
    id, ruta_minio: `evidencias/acciones/acc-1/${id}.pdf`, nombre_original: 'plano.pdf', tipo_archivo: 'application/pdf', tipo_medio: 'archivo',
  }));
  actividadQueries.obtenerAdjuntoActividad.mockResolvedValue({ archivo_url: 'actividad/tarea/t1/x.pdf', archivo_nombre: 'x.pdf', metadata: {} });
  mockAlmacen.statObject.mockResolvedValue({ size: 4, etag: 'e', metaData: {} });
  mockAlmacen.getObject.mockImplementation(async () => Readable.from([Buffer.from('%PDF')]));
});

async function pedirBoleto(tipo, id, accion, headers = { Authorization: `Bearer ${SESION}` }) {
  const ruta = tipo === 'evidencia' ? 'evidencias' : 'actividad';
  const r = await fetch(`${base}/${ruta}/${id}/boleto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ accion }),
  });
  return { r, cuerpo: await r.json() };
}

describe('emisión', () => {
  test('con la cabecera normal devuelve boleto, ruta relativa y vigencia de 60 s', async () => {
    const { r, cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(cuerpo.datos.expira_en_segundos).toBe(60);
    expect(cuerpo.datos.ruta).toBe(`/evidencias/${EV_A}/ver?boleto=${encodeURIComponent(cuerpo.datos.boleto)}`);
    // Ligado a persona, objeto y acción.
    const datos = jwt.decode(cuerpo.datos.boleto);
    expect(datos).toMatchObject({ sub: 'u-1', obj: `evidencia:${EV_A}`, acc: 'ver', prp: 'archivo', aud: 'pspp-archivo' });
    expect(datos.exp - datos.iat).toBe(60);
  });

  test('no se puede pedir con el token de sesión en la URL', async () => {
    const r = await fetch(`${base}/evidencias/${EV_A}/boleto?token=${SESION}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'ver' }),
    });
    expect(r.status).toBe(401);
  });

  test('no se emite para algo que el usuario no puede ver', async () => {
    autorizacion.puedeVerProyecto.mockResolvedValue(false);
    const { r } = await pedirBoleto('evidencia', EV_A, 'descargar');
    expect(r.status).toBe(403);
  });

  test('acción desconocida → 400', async () => {
    const { r } = await pedirBoleto('evidencia', EV_A, 'borrar');
    expect(r.status).toBe(400);
  });

  test('BOLETO_ARCHIVO_TTL_SEGUNDOS cambia la vigencia; inválido o vacío vuelve a 60; tope de 15 min', () => {
    process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS = '30';
    expect(vigenciaSegundos()).toBe(30);
    process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS = 'abc';
    expect(vigenciaSegundos()).toBe(60);
    process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS = '';
    expect(vigenciaSegundos()).toBe(60);
    process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS = '-5';
    expect(vigenciaSegundos()).toBe(60);
    process.env.BOLETO_ARCHIVO_TTL_SEGUNDOS = '999999';
    expect(vigenciaSegundos()).toBe(900);
  });
});

describe('uso del boleto en la URL', () => {
  test('boleto válido → 200 con el archivo, y los permisos se vuelven a validar', async () => {
    const { cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    autorizacion.puedeVerProyecto.mockClear();
    const r = await fetch(`${base}${cuerpo.datos.ruta}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(await r.text()).toBe('%PDF');
    expect(autorizacion.puedeVerProyecto).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-1', rol: 'operativo' }), 'proyecto-1');
  });

  test('boleto de descarga → attachment; también para adjuntos de tareas', async () => {
    let { cuerpo } = await pedirBoleto('evidencia', EV_A, 'descargar');
    let r = await fetch(`${base}${cuerpo.datos.ruta}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^attachment;/);

    ({ cuerpo } = await pedirBoleto('actividad', ACT_A, 'ver'));
    r = await fetch(`${base}${cuerpo.datos.ruta}`);
    expect(r.status).toBe(200);
    expect(mockAlmacen.getObject).toHaveBeenCalledWith('actividad/tarea/t1/x.pdf');
  });

  test('boleto expirado → 401 BOLETO_EXPIRADO, no 500, y sin tocar el almacén', async () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'evidencia', id: EV_A, accion: 'ver' });
    // jsonwebtoken lee Date.now(): se adelanta el reloj 61 s.
    jest.useFakeTimers({ now: Date.now() + 61 * 1000, doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask', 'setInterval'] });
    const r = await fetch(`${base}/evidencias/${EV_A}/ver?boleto=${encodeURIComponent(boleto)}`);
    jest.useRealTimers();
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('BOLETO_EXPIRADO');
    expect(mockAlmacen.statObject).not.toHaveBeenCalled();
  });

  test('boleto de otro objeto → 401 BOLETO_OTRO_OBJETO, sin consultar permisos ni almacén', async () => {
    const { cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    const r = await fetch(`${base}/evidencias/${EV_B}/ver?boleto=${encodeURIComponent(cuerpo.datos.boleto)}`);
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('BOLETO_OTRO_OBJETO');
    expect(autorizacion.puedeVerProyecto).toHaveBeenCalledTimes(1); // solo el de la emisión
    expect(mockAlmacen.statObject).not.toHaveBeenCalled();
  });

  test('mismo id pero otro tipo (evidencia ↔ actividad) → 401', async () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'evidencia', id: ACT_A, accion: 'ver' });
    const r = await fetch(`${base}/actividad/${ACT_A}/ver?boleto=${encodeURIComponent(boleto)}`);
    expect(r.status).toBe(401);
  });

  test('boleto de "ver" no sirve para "descargar" (ni al revés)', async () => {
    const { cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    const r = await fetch(`${base}/evidencias/${EV_A}/descargar?boleto=${encodeURIComponent(cuerpo.datos.boleto)}`);
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('BOLETO_OTRO_OBJETO');
  });

  test('firma alterada → 401 BOLETO_INVALIDO', async () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'evidencia', id: EV_A, accion: 'ver' });
    const [h, p] = boleto.split('.');
    const r = await fetch(`${base}/evidencias/${EV_A}/ver?boleto=${h}.${p}.firmafalsa`);
    expect(r.status).toBe(401);
    expect((await r.json()).codigo).toBe('BOLETO_INVALIDO');
  });

  test('boleto con un payload editado a mano (otro objeto, misma firma) → 401', async () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'evidencia', id: EV_A, accion: 'ver' });
    const [h, p, f] = boleto.split('.');
    const datos = JSON.parse(Buffer.from(p, 'base64url').toString());
    datos.obj = `evidencia:${EV_B}`;
    const editado = `${h}.${Buffer.from(JSON.stringify(datos)).toString('base64url')}.${f}`;
    const r = await fetch(`${base}/evidencias/${EV_B}/ver?boleto=${editado}`);
    expect(r.status).toBe(401);
  });
});

describe('boleto y sesión no son intercambiables', () => {
  test('token de sesión usado como boleto en la URL → 401', async () => {
    const r = await fetch(`${base}/evidencias/${EV_A}/ver?boleto=${SESION}`);
    expect(r.status).toBe(401);
    expect(mockAlmacen.statObject).not.toHaveBeenCalled();
  });

  test('token de sesión en ?token= (la vía anterior) → 401 en archivos y en el resto de la API', async () => {
    let r = await fetch(`${base}/evidencias/${EV_A}/descargar?token=${SESION}`);
    expect(r.status).toBe(401);
    r = await fetch(`${base}/yo?token=${SESION}`);
    expect(r.status).toBe(401);
  });

  test('un token de sesión firmado con la clave correcta pero con propósito de boleto → rechazado como sesión', async () => {
    // Aunque alguien firmara un "boleto" con JWT_SECRET (la clave de
    // sesión), el claim prp hace que verificarToken lo rechace.
    const falso = jwt.sign({ id: 'u-1', rol: 'superadmin', prp: 'archivo' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const r = await fetch(`${base}/yo`, { headers: { Authorization: `Bearer ${falso}` } });
    expect(r.status).toBe(401);
  });

  test('boleto usado como token de sesión en la cabecera → 401 en cualquier endpoint', async () => {
    const { cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    const cabecera = { Authorization: `Bearer ${cuerpo.datos.boleto}` };

    let r = await fetch(`${base}/yo`, { headers: cabecera });
    expect(r.status).toBe(401);

    // Ni para pedir otro boleto (encadenar boletos sin sesión).
    ({ r } = await pedirBoleto('evidencia', EV_B, 'ver', cabecera));
    expect(r.status).toBe(401);

    // Ni siquiera en el mismo archivo para el que se emitió: en la cabecera
    // solo vale una sesión; el boleto solo vale en la URL.
    r = await fetch(`${base}/evidencias/${EV_A}/ver`, { headers: cabecera });
    expect(r.status).toBe(401);
  });

  test('boleto en ?boleto= de un endpoint que no es de archivo → 401 (se ignora)', async () => {
    const { cuerpo } = await pedirBoleto('evidencia', EV_A, 'ver');
    const r = await fetch(`${base}/yo?boleto=${encodeURIComponent(cuerpo.datos.boleto)}`);
    expect(r.status).toBe(401);
  });

  test('la cabecera de sesión sigue funcionando en los endpoints de archivo', async () => {
    const r = await fetch(`${base}/evidencias/${EV_A}/descargar`, { headers: { Authorization: `Bearer ${SESION}` } });
    expect(r.status).toBe(200);
  });
});

describe('verificarBoleto (unidad)', () => {
  test('devuelve al usuario que lo pidió', () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'actividad', id: ACT_A, accion: 'descargar' });
    expect(verificarBoleto(boleto, { tipo: 'actividad', id: ACT_A, accion: 'descargar' }))
      .toEqual({ id: 'u-1', rol: 'operativo', id_dg: 7, id_direccion_area: null });
  });

  test('un boleto firmado con otro JWT_SECRET no vale', () => {
    const { boleto } = emitirBoleto(USUARIO, { tipo: 'actividad', id: ACT_A, accion: 'ver' });
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'otro-secreto';
    try {
      expect(() => verificarBoleto(boleto, { tipo: 'actividad', id: ACT_A, accion: 'ver' })).toThrow(expect.objectContaining({ codigo: 'BOLETO_INVALIDO', statusCode: 401 }));
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});
