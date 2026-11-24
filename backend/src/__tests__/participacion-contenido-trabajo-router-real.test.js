/**
 * ARCHIVO: participacion-contenido-trabajo-router-real.test.js
 * PROPÓSITO: paso 14 DGTIC — comentarios, documentos/evidencias y riesgos
 *            dejaron de pasar por puedeVerProyecto (visibilidad total
 *            entre internos) y ahora exigen una vía real de
 *            funcionEfectivaEnProyecto/funcionEfectivaEnNodo
 *            (exigirParticipacion*, utils/alcance-lectura.js).
 *
 * Mismo método que visibilidad-externo-router-real.test.js (paso 13):
 * router REAL (routes/index.js) sobre un servidor Express real, con
 * peticiones HTTP reales vía `fetch`. Se mockean los mismos dos puntos
 * (`db/pool`, `utils/minio.js`) y `middleware/auth.middleware.js` — aquí
 * también `autenticarArchivo`, que paso 13 no necesitaba cubrir (ninguna
 * de sus 24 rutas pasaba por routes/archivos.routes.js, montado ANTES de
 * verificarToken), para poder fijar req.usuario por cabecera de prueba en
 * esas rutas también.
 *
 * TRES cuentas por ruta, pedidas explícitamente para este paso (a
 * diferencia de paso 13, que solo necesitaba 'externo sin relación'
 * porque puedeVerProyecto no distingue entre internos):
 *   - PARTICIPA: invitada al proyecto (proyecto_usuarios, rol 'lectura')
 *     — el mínimo que ya alcanza para participación.
 *   - INTERNO_NO_PARTICIPA: perfil interno (enlace) sin ninguna fila de
 *     invitación, sin ser creador, sin bono de DG — antes pasaba siempre
 *     (puedeVerProyecto es `true` para cualquier interno); ahora, al
 *     exigir participación real, se rechaza igual que un externo.
 *   - EXTERNO_SIN_RELACION: mismo caso de siempre, rechazado también.
 *
 * Para quien participa se exige únicamente que NO sea 403 (no "200"): la
 * mayoría de estos endpoints llegan a un controller real contra un mock
 * de BD/almacén deliberadamente incompleto (solo lo que cada middleware
 * necesita para resolver el proyecto/nodo) — un 500 ahí prueba lo mismo
 * que un 200, que el middleware no rechazó con 403 (mismo criterio que
 * paso 13, ver su cabecera).
 *
 * Ejecutar: npm test (ejecutar el archivo aislado con npx jest <archivo>
 * CUELGA en este entorno — ver nota de paso 13 — correr siempre la suite
 * completa sin filtro).
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
// Mismo truco que paso 13 para verificarToken — y aquí TAMBIÉN para
// autenticarArchivo, que las rutas de transmisión (archivos.routes.js)
// usan en vez de verificarToken (se montan antes, por el boleto efímero
// en la URL). Sin esto, req.usuario quedaría sin definir en /evidencias/
// :id/ver|descargar y /actividad/:id/ver|descargar, y toda petición ahí
// se rechazaría sin importar la cuenta.
jest.mock('../middleware/auth.middleware.js', () => ({
  verificarToken: (req, res, next) => {
    const cabecera = req.headers['x-test-usuario'];
    req.usuario = cabecera ? JSON.parse(cabecera) : { id: 'sin-cabecera', rol: 'externo' };
    next();
  },
  verificarTokenSesion: jest.fn(),
  autenticarArchivo: () => (req, res, next) => {
    const cabecera = req.headers['x-test-usuario'];
    req.usuario = cabecera ? JSON.parse(cabecera) : { id: 'sin-cabecera', rol: 'externo' };
    next();
  },
}));

const pool = require('../db/pool');
const errorHandler = require('../middleware/errorHandler');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000f1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000f2';
const ACCION_A = '00000000-0000-0000-0000-0000000000f3';
const TAREA_A = '00000000-0000-0000-0000-0000000000f4';
const RIESGO_A = '00000000-0000-0000-0000-0000000000f5';
const EVIDENCIA_A = '00000000-0000-0000-0000-0000000000f6';
const ACTIVIDAD_A = '00000000-0000-0000-0000-0000000000f7';

const PARTICIPA = { id: 'u-participa', rol: 'enlace' };
const INTERNO_NO_PARTICIPA = { id: 'u-interno-ajeno', rol: 'enlace' };
const EXTERNO_SIN_RELACION = { id: 'u-externo-ajeno', rol: 'externo' };

function mockPool() {
  pool.query.mockImplementation((sql, params) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      const participa = idUsuario === PARTICIPA.id;
      return Promise.resolve({ rows: participa ? [{ rol: 'lectura' }] : [] });
    }
    if (/FROM nodo_miembros/.test(sql)) {
      return Promise.resolve({ rows: [] });
    }
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_responsable: null }] });
    }
    if (/FROM acciones WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_etapa: null, id_accion_padre: null, id_responsable: null }] });
    }
    if (/FROM tareas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_accion: ACCION_A, id_responsable: null }] });
    }
    if (/FROM riesgos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ entidad_tipo: 'proyecto', entidad_id: PROYECTO_A }] });
    }
    if (/FROM evidencias WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_etapa: ETAPA_A, id_accion: null, id_subaccion: null, id_riesgo: null }] });
    }
    if (/FROM actividad WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: null, id_etapa: ETAPA_A, id_accion: null, id_tarea: null }] });
    }
    return Promise.resolve({ rows: [] });
  });
  pool.connect.mockResolvedValue({ query: pool.query, release: jest.fn() });
}

let servidor, base;
let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => consoleErrorSpy.mockRestore());

function levantar(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ servidor: s, base: `http://127.0.0.1:${s.address().port}/api/v1` }));
  });
}

beforeAll(async () => {
  const routes = require('../routes/index.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  app.use(errorHandler);
  ({ servidor, base } = await levantar(app));
});

afterAll(() => new Promise((resolve) => servidor.close(resolve)));
beforeEach(() => { jest.clearAllMocks(); mockPool(); });

async function pedir(ruta, usuario, metodo = 'GET', body) {
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      'X-Test-Usuario': JSON.stringify(usuario),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, cuerpo: texto ? JSON.parse(texto) : null };
}

// Las 21 rutas reclasificadas de visibilidad a participación en este paso.
const RUTAS = [
  { ruta: `/etapas/${ETAPA_A}/evidencias` },
  { ruta: `/acciones/${ACCION_A}/evidencias` },
  { ruta: `/riesgos/${RIESGO_A}/evidencias` },
  { ruta: `/subacciones/${ACCION_A}/evidencias` },
  { ruta: `/proyectos/${PROYECTO_A}/evidencias` },
  { ruta: `/etapas/${ETAPA_A}/documentos` },
  { ruta: `/acciones/${ACCION_A}/documentos` },
  { ruta: `/tareas/${TAREA_A}/documentos` },
  { ruta: `/proyectos/${PROYECTO_A}/riesgos` },
  { ruta: `/etapas/${ETAPA_A}/riesgos` },
  { ruta: `/acciones/${ACCION_A}/riesgos` },
  { ruta: `/subacciones/${ACCION_A}/riesgos` },
  { ruta: `/tareas/${TAREA_A}/riesgos` },
  { ruta: `/comentarios?entidad_tipo=Proyecto&entidad_id=${PROYECTO_A}` },
  { ruta: `/riesgos/${RIESGO_A}` },
  { ruta: `/evidencias/${EVIDENCIA_A}/ver` },
  { ruta: `/evidencias/${EVIDENCIA_A}/descargar` },
  { ruta: `/actividad/${ACTIVIDAD_A}/ver` },
  { ruta: `/actividad/${ACTIVIDAD_A}/descargar` },
];

const RUTAS_POST = [
  { ruta: `/evidencias/${EVIDENCIA_A}/boleto`, body: { accion: 'ver' } },
  { ruta: `/actividad/${ACTIVIDAD_A}/boleto`, body: { accion: 'ver' } },
];

describe('contenido de trabajo (comentarios/documentos-evidencias/riesgos) — interno SIN participación real', () => {
  test.each(RUTAS)('$ruta: responde 403 SIN_PARTICIPACION', async ({ ruta }) => {
    const r = await pedir(ruta, INTERNO_NO_PARTICIPA);
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });

  test.each(RUTAS_POST)('POST $ruta: responde 403 SIN_PARTICIPACION', async ({ ruta, body }) => {
    const r = await pedir(ruta, INTERNO_NO_PARTICIPA, 'POST', body);
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });
});

describe('contenido de trabajo — externo sin relación', () => {
  test.each(RUTAS)('$ruta: responde 403 SIN_PARTICIPACION', async ({ ruta }) => {
    const r = await pedir(ruta, EXTERNO_SIN_RELACION);
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });

  test.each(RUTAS_POST)('POST $ruta: responde 403 SIN_PARTICIPACION', async ({ ruta, body }) => {
    const r = await pedir(ruta, EXTERNO_SIN_RELACION, 'POST', body);
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });
});

describe('contenido de trabajo — quien SÍ participa (invitación de lectura al proyecto)', () => {
  test.each(RUTAS)('$ruta: no 403', async ({ ruta }) => {
    const r = await pedir(ruta, PARTICIPA);
    expect(r.status).not.toBe(403);
  });

  test.each(RUTAS_POST)('POST $ruta: no 403', async ({ ruta, body }) => {
    const r = await pedir(ruta, PARTICIPA, 'POST', body);
    expect(r.status).not.toBe(403);
  });
});

describe('control — superadmin y direccion_dg (vías ya cubiertas por funcionEfectivaEnProyecto)', () => {
  test('superadmin: participa en cualquier proyecto sin ninguna fila de invitación', async () => {
    const r = await pedir(`/proyectos/${PROYECTO_A}/riesgos`, { id: 'u-super', rol: 'superadmin' });
    expect(r.status).not.toBe(403);
  });

  test('direccion de la misma DG que lidera el proyecto: participa (bono de DG, paso 14)', async () => {
    pool.query.mockImplementation((sql, params) => {
      if (/FROM proyectos WHERE id = \$1/.test(sql)) {
        return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: 9 }] });
      }
      if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const r = await pedir(`/proyectos/${PROYECTO_A}/riesgos`, { id: 'u-direccion', rol: 'direccion', id_dg: 9 });
    expect(r.status).not.toBe(403);
  });

  test('direccion de OTRA DG: no participa', async () => {
    pool.query.mockImplementation((sql) => {
      if (/FROM proyectos WHERE id = \$1/.test(sql)) {
        return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: 9 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const r = await pedir(`/proyectos/${PROYECTO_A}/riesgos`, { id: 'u-direccion-otra', rol: 'direccion', id_dg: 1 });
    expect(r.status).toBe(403);
    expect(r.cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });
});
