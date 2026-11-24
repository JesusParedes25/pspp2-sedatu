/**
 * ARCHIVO: visibilidad-externo-router-real.test.js
 * PROPÓSITO: paso 13 DGTIC — reemplaza a riesgos-indicadores-visibilidad.test.js,
 *            acciones-indicadores-visibilidad.test.js y
 *            lectura-estructural-visibilidad.test.js (pasos 10, 11 y 12),
 *            que verificaban que la línea del middleware existe en el
 *            código fuente, no que una petición real se rechace. Esa
 *            diferencia es exactamente lo que dejó sin detectar el
 *            montaje duplicado de /etapas/:id/indicadores (ver más abajo
 *            y el PR del paso 13): la línea protegida existía, pero
 *            nunca era la que Express atendía.
 *
 * Esta prueba levanta el router REAL de producción (routes/index.js, el
 * mismo que monta server.js, en el mismo orden: subrouters antes que las
 * rutas directas) sobre un servidor Express real, y hace peticiones HTTP
 * reales con `fetch` contra él — no invoca ningún middleware por su
 * cuenta ni revisa el código fuente. Solo se mockean, por ser los dos
 * únicos puntos que harían una llamada real hacia afuera en un entorno de
 * prueba: `db/pool` (Postgres) y `utils/minio.js` (si no se mockea, al
 * cargar evidencias/actividad/proyectos.controller.js intenta verificar
 * el bucket de MinIO y falla con un error de DNS — no rompe la prueba,
 * pero ensucia la salida). `middleware/auth.middleware.js` se mockea
 * para fijar `req.usuario` desde una cabecera de prueba en vez de
 * verificar un JWT real — es la única forma de controlar el rol sin
 * meter un secreto de JWT real en una prueba.
 *
 * El caso que importa es SIEMPRE el mismo: un usuario `externo` sin
 * ninguna fila de invitación sobre el proyecto/nodo de la prueba — es el
 * único rol al que `puedeVerProyecto` (autorizacion.js) le exige algo;
 * cualquier otro rol pasa siempre, por diseño documentado
 * (docs/modelo-permisos.md, sección 5.1) y no es señal de nada.
 *
 * Ejecutar: npm test
 */
const express = require('express');

jest.mock('../db/pool', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/minio.js', () => ({
  minioClient: { bucketExists: jest.fn().mockResolvedValue(true), makeBucket: jest.fn() },
  BUCKET: 'test',
  PREFIJO: '',
  almacen: {},
  claveFisica: (k) => k,
  normalizarPrefijo: () => '',
  esObjetoInexistente: () => false,
}));
// Sustituye la verificación de JWT por una lectura directa de
// X-Test-Usuario (JSON) — lo único que esta prueba necesita controlar es
// el rol y el id del usuario, nunca un token real.
jest.mock('../middleware/auth.middleware.js', () => ({
  verificarToken: (req, res, next) => {
    const cabecera = req.headers['x-test-usuario'];
    req.usuario = cabecera ? JSON.parse(cabecera) : { id: 'sin-cabecera', rol: 'externo' };
    next();
  },
  verificarTokenSesion: jest.fn(),
  autenticarArchivo: () => (req, res, next) => next(),
}));

const pool = require('../db/pool');
const errorHandler = require('../middleware/errorHandler');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000e1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000e2';
const ACCION_A = '00000000-0000-0000-0000-0000000000e3';
const TAREA_A = '00000000-0000-0000-0000-0000000000e4';
const INDICADOR_A = '00000000-0000-0000-0000-0000000000e5';

const EXTERNO_SIN_RELACION = { id: 'u-externo-ajeno', rol: 'externo' };
const EXTERNO_INVITADO = { id: 'u-externo-invitado', rol: 'externo' };
const INTERNO_SIN_RELACION = { id: 'u-enlace-ajeno', rol: 'enlace' };

function mockPool(membresia = []) {
  pool.query.mockImplementation((sql, params) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      const fila = membresia.find((m) => m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    if (/FROM acciones WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_etapa: null }] });
    }
    if (/FROM tareas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_accion: ACCION_A }] });
    }
    if (/FROM indicadores WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    return Promise.resolve({ rows: [] });
  });
  pool.connect.mockResolvedValue({
    query: pool.query,
    release: jest.fn(),
  });
}

let servidor, base;

// Varios de los casos de control llegan al controller real y pueden
// tronar contra el mock genérico de pool ({rows: []}) — un 500 ahí
// prueba lo mismo que un 200 (que el middleware no rechazó con 403), así
// que no hace falta que el controller tenga éxito. Se silencia el log
// de errorHandler.js para esos casos esperados, sin ocultar un fallo
// real de la propia prueba (jest sigue reportando asserts fallidos).
let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => consoleErrorSpy.mockRestore());

function levantar(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ servidor: s, base: `http://127.0.0.1:${s.address().port}/api/v1` }));
  });
}

beforeAll(async () => {
  // Mismo montaje que server.js: express.json() antes del router real,
  // errorHandler al final — todo bajo el mismo prefijo /api/v1.
  const routes = require('../routes/index.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  app.use(errorHandler);
  ({ servidor, base } = await levantar(app));
});

afterAll(() => new Promise((resolve) => servidor.close(resolve)));
beforeEach(() => jest.clearAllMocks());

// Siempre se drena el cuerpo de la respuesta (aunque a quien llama solo
// le importe el status) — dejar un cuerpo sin consumir con `fetch`
// filtra la conexión keep-alive y cuelga el `servidor.close()` del
// afterAll de esta prueba.
async function pedir(ruta, usuario) {
  const r = await fetch(`${base}${ruta}`, { headers: { 'X-Test-Usuario': JSON.stringify(usuario) } });
  const texto = await r.text();
  return { status: r.status, cuerpo: texto ? JSON.parse(texto) : null };
}

// Las 24 rutas cerradas en los pasos 10 (5), 11 (2) y 12 (17) — una de
// cada bloque de router.get(...) de routes/index.js que agregó
// exigirVisibilidad* en alguno de esos tres pasos.
const RUTAS = [
  // Paso 10
  { ruta: `/etapas/${ETAPA_A}/riesgos`, paso: 10 },
  { ruta: `/acciones/${ACCION_A}/riesgos`, paso: 10 },
  { ruta: `/subacciones/${ACCION_A}/riesgos`, paso: 10 },
  { ruta: `/tareas/${TAREA_A}/riesgos`, paso: 10 },
  { ruta: `/etapas/${ETAPA_A}/indicadores`, paso: 10 },
  // Paso 11
  { ruta: `/acciones/${ACCION_A}/indicadores`, paso: 11 },
  { ruta: `/indicadores/${INDICADOR_A}/resumen-aportaciones`, paso: 11 },
  // Paso 12
  { ruta: `/proyectos/${PROYECTO_A}/etapas`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/arbol`, paso: 12 },
  { ruta: `/etapas/${ETAPA_A}/acciones`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/acciones`, paso: 12 },
  { ruta: `/acciones/${ACCION_A}/subacciones`, paso: 12 },
  { ruta: `/acciones/${ACCION_A}/tareas`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/stats`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/actividades-sin-fecha`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/actividad-reciente`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/bitacora`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/portada-resumen`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/campos-extra-schema`, paso: 12 },
  { ruta: `/proyectos/${PROYECTO_A}/panorama-rapido`, paso: 12 },
  { ruta: `/conteo-descendientes?entidad_tipo=Proyecto&entidad_id=${PROYECTO_A}`, paso: 12 },
  { ruta: `/etapas/${ETAPA_A}/miembros-nodo`, paso: 12 },
  { ruta: `/acciones/${ACCION_A}/miembros-nodo`, paso: 12 },
  { ruta: `/tareas/${TAREA_A}/miembros-nodo`, paso: 12 },
];

describe('rutas de los pasos 10/11/12 — externo SIN relación con el proyecto', () => {
  test.each(RUTAS)('$ruta (paso $paso): responde 403', async ({ ruta }) => {
    mockPool([]);
    const r = await pedir(ruta, EXTERNO_SIN_RELACION);
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('NO_AUTORIZADO');
  });
});

describe('control — la misma regla deja pasar a quien sí tiene acceso', () => {
  test('externo CON invitación (lectura) al proyecto: /proyectos/:id/etapas no 403', async () => {
    mockPool([{ id_usuario: EXTERNO_INVITADO.id, rol: 'lectura' }]);
    const r = await pedir(`/proyectos/${PROYECTO_A}/etapas`, EXTERNO_INVITADO);
    expect(r.status).not.toBe(403);
  });

  test('externo CON invitación a la etapa (vía herencia del proyecto): /etapas/:id/acciones no 403', async () => {
    mockPool([{ id_usuario: EXTERNO_INVITADO.id, rol: 'lectura' }]);
    const r = await pedir(`/etapas/${ETAPA_A}/acciones`, EXTERNO_INVITADO);
    expect(r.status).not.toBe(403);
  });

  test('externo CON invitación: /tareas/:id/miembros-nodo (segundo parámetro, tareaId) no 403', async () => {
    mockPool([{ id_usuario: EXTERNO_INVITADO.id, rol: 'lectura' }]);
    const r = await pedir(`/tareas/${TAREA_A}/miembros-nodo`, EXTERNO_INVITADO);
    expect(r.status).not.toBe(403);
  });

  test('externo CON invitación: /conteo-descendientes (entidad en query) no 403', async () => {
    mockPool([{ id_usuario: EXTERNO_INVITADO.id, rol: 'lectura' }]);
    const r = await pedir(`/conteo-descendientes?entidad_tipo=Proyecto&entidad_id=${PROYECTO_A}`, EXTERNO_INVITADO);
    expect(r.status).not.toBe(403);
  });

  test('interno (enlace) SIN ninguna relación con el proyecto: pasa igual — la visibilidad total entre perfiles internos es la regla, no un hueco (docs/modelo-permisos.md 5.1)', async () => {
    mockPool([]);
    const r = await pedir(`/proyectos/${PROYECTO_A}/bitacora`, INTERNO_SIN_RELACION);
    expect(r.status).not.toBe(403);
  });
});
