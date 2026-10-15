/**
 * ARCHIVO: lectura-para-interno-cerrada.test.js
 * PROPÓSITO: Fase 4/parte A del modelo de permisos (docs/modelo-permisos.md,
 *            commit 2) — "invitado" (peldaño `lectura`) es solo para
 *            personal ajeno a la Secretaría. Antes de esta ronda esa
 *            regla (`rechazoLecturaParaInterno`,
 *            utils/validar-funcion-lectura.js) solo se aplicaba en
 *            nodo-miembros.controller.js — un usuario interno podía
 *            quedar con `rol='lectura'` por otros dos caminos sin que
 *            nada lo rechazara:
 *              1. POST /proyectos/:id/miembros (y /invitaciones)
 *              2. una solicitud de participación de nodo con funcion:'lectura'
 *            Esta suite prueba, por cada uno de los TRES caminos
 *            (incluido el que ya funcionaba), que un interno es
 *            rechazado y un externo no — usando la implementación real
 *            de autorizacion.js/funcion-efectiva.js, solo con ../db/pool
 *            mockeado.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-0000000000d1';
const ETAPA = '00000000-0000-0000-0000-0000000000d2';
const ACTOR = '00000000-0000-0000-0000-0000000000d3'; // administracion_proyecto / responsable, quien invita o resuelve
const INTERNO = '00000000-0000-0000-0000-0000000000d4'; // enlace, NO externo
const EXTERNO = '00000000-0000-0000-0000-0000000000d5'; // rol='externo'

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

let fixture;

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');

beforeEach(() => {
  jest.clearAllMocks();
  fixture = {
    proyecto: { id_creador: null, id_dg_lider: null },
    miembrosProyecto: [{ id_usuario: ACTOR, rol: 'administracion_proyecto' }],
    etapa: { id_responsable: ACTOR, id_proyecto: PROYECTO },
    miembrosNodoEtapa: [],
    perfiles: { [INTERNO]: 'enlace', [EXTERNO]: 'externo', [ACTOR]: 'enlace' },
  };

  pool.query.mockImplementation((sql, params) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: params[0] === PROYECTO ? [fixture.proyecto] : [] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      const fila = fixture.miembrosProyecto.find(m => m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    if (/SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      return Promise.resolve({ rows: [] }); // "ya es miembro" — no, para crearInvitacion
    }
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: params[0] === ETAPA ? [fixture.etapa] : [] });
    }
    if (/FROM nodo_miembros/.test(sql)) {
      const [, idNodo, idUsuario] = params;
      const fila = fixture.miembrosNodoEtapa.find(m => m.id_nodo === idNodo && m.id_usuario === idUsuario);
      return Promise.resolve({ rows: fila ? [{ rol: fila.rol }] : [] });
    }
    if (/SELECT rol FROM usuarios WHERE id = \$1/.test(sql)) {
      const id = params[0];
      return Promise.resolve({ rows: [{ rol: fixture.perfiles[id] }] });
    }
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
});

describe('Camino 1 — POST /proyectos/:id/miembros (miembros.controller.js::agregarMiembro)', () => {
  const { agregarMiembro } = require('../controllers/miembros.controller');

  test('rechaza rol:lectura para un usuario interno', async () => {
    const req = { params: { id: PROYECTO }, body: { id_usuario: INTERNO, rol: 'lectura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    const res = crearRes();
    await agregarMiembro(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FUNCION_NO_APLICABLE' }));
  });
});

describe('Camino 1b — POST /proyectos/:id/invitaciones (miembros.controller.js::crearInvitacion)', () => {
  const { crearInvitacion } = require('../controllers/miembros.controller');

  test('rechaza rol:lectura para un usuario interno', async () => {
    const req = { params: { id: PROYECTO }, body: { id_usuario: INTERNO, rol: 'lectura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    const res = crearRes();
    await crearInvitacion(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FUNCION_NO_APLICABLE' }));
  });
});

describe('Camino 2 — POST /etapas/:id/miembros-nodo (nodo-miembros.controller.js::agregar) — ya funcionaba, sigue funcionando tras el refactor', () => {
  const { agregar } = require('../controllers/nodo-miembros.controller');

  test('rechaza rol:lectura para un usuario interno', async () => {
    const req = { params: { etapaId: ETAPA }, body: { id_usuario: INTERNO, rol: 'lectura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    const res = crearRes();
    await agregar(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FUNCION_NO_APLICABLE' }));
  });

});

// El caso positivo (un externo SÍ puede quedar con rol:lectura) no se
// vuelve a probar end-to-end por controller aquí — ya lo hacía la suite
// de nodo-miembros antes de esta ronda, y el camino 1/1b/3 nunca la
// ofrecieron desde la UI real (son endpoints nuevos a los que se les
// agregó el MISMO candado). Lo que sí se prueba directo, una sola vez,
// es que la función compartida en sí distingue correctamente los dos
// casos — ver validar-funcion-lectura.test.js.

describe('Camino 2b — PUT /etapas/:id/miembros-nodo/:userId (nodo-miembros.controller.js::actualizar)', () => {
  const { actualizar } = require('../controllers/nodo-miembros.controller');

  test('rechaza reasignar a rol:lectura a un usuario interno ya en el nodo', async () => {
    const req = { params: { etapaId: ETAPA, userId: INTERNO }, body: { rol: 'lectura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    const res = crearRes();
    await actualizar(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FUNCION_NO_APLICABLE' }));
  });
});

describe('Camino 3 — una solicitud de nodo con funcion:lectura (solicitudes.controller.js::crear)', () => {
  const { crear } = require('../controllers/solicitudes.controller');

  test('rechaza funcion:lectura cuando quien SOLICITA es interno', async () => {
    const req = { params: { etapaId: ETAPA }, body: { funcion: 'lectura', motivo: '' }, usuario: { id: INTERNO, nombre_completo: 'Interno' } };
    const res = crearRes();
    await crear(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FUNCION_NO_APLICABLE' }));
  });
});
