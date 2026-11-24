/**
 * ARCHIVO: lectura-estructural-visibilidad.test.js
 * PROPÓSITO: paso 12 DGTIC — decisión de modelo: la visibilidad de
 *            proyecto ahora también restringe la LECTURA, no solo la
 *            captura (antes la lectura era total para cualquier
 *            autenticado, el modelo documentado decía otra cosa). Cierra
 *            los quince endpoints marcados como "hueco real" en el
 *            reporte del paso 11, con el mismo middleware que ya usan
 *            los endpoints equivalentes, y el mismo criterio de prueba
 *            que riesgos-indicadores-visibilidad.test.js /
 *            acciones-indicadores-visibilidad.test.js: línea de ruta por
 *            código fuente + middleware real importado directo de
 *            alcance-lectura.js.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const path = require('path');

const RUTAS = [
  { ruta: "'/proyectos/:id/etapas'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/arbol'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/etapas/:id/acciones'", middleware: "exigirVisibilidadNodo('etapa')" },
  { ruta: "'/proyectos/:id/acciones'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/acciones/:id/subacciones'", middleware: "exigirVisibilidadNodo('accion')" },
  { ruta: "'/acciones/:id/tareas'", middleware: "exigirVisibilidadNodo('accion')" },
  { ruta: "'/proyectos/:id/stats'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/actividades-sin-fecha'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/actividad-reciente'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/bitacora'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/portada-resumen'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/campos-extra-schema'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/proyectos/:id/panorama-rapido'", middleware: 'exigirVisibilidadProyecto()' },
  { ruta: "'/conteo-descendientes'", middleware: 'exigirVisibilidadDeEntidadEnQuery()' },
  { ruta: "'/etapas/:etapaId/miembros-nodo'", middleware: "exigirVisibilidadNodo('etapa', 'etapaId')" },
  { ruta: "'/acciones/:accionId/miembros-nodo'", middleware: "exigirVisibilidadNodo('accion', 'accionId')" },
  { ruta: "'/tareas/:tareaId/miembros-nodo'", middleware: "exigirVisibilidadNodo('tarea', 'tareaId')" },
];

describe.each(RUTAS)('$ruta declara $middleware antes del controller', ({ ruta, middleware }) => {
  test('verificado por código fuente', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '../routes/index.js'), 'utf8');
    const linea = fuente.split('\n').find((l) => l.includes(ruta) && l.includes('router.get'));
    expect(linea).toBeDefined();
    expect(linea).toContain(middleware);
  });
});

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const {
  exigirVisibilidadNodo, exigirVisibilidadProyecto, exigirVisibilidadDeEntidadEnQuery,
} = require('../utils/alcance-lectura');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000d1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000d2';
const ACCION_A = '00000000-0000-0000-0000-0000000000d3';
const TAREA_A = '00000000-0000-0000-0000-0000000000d4';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

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
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => jest.clearAllMocks());

const CASOS_PARAMS = [
  { nombre: 'etapas/arbol/acciones/stats/bitácora/… de un proyecto', mw: () => exigirVisibilidadProyecto(), id: PROYECTO_A },
  { nombre: 'acciones de una etapa, miembros-nodo de etapa', mw: () => exigirVisibilidadNodo('etapa'), id: ETAPA_A },
  { nombre: 'subacciones/tareas de una acción, miembros-nodo de acción', mw: () => exigirVisibilidadNodo('accion'), id: ACCION_A },
  { nombre: 'miembros-nodo de una tarea', mw: () => exigirVisibilidadNodo('tarea'), id: TAREA_A },
];

describe.each(CASOS_PARAMS)('$nombre — el candado real', ({ mw, id }) => {
  test('externo SIN invitación al proyecto: 403, nunca llega al controller', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-externo', rol: 'externo' }, params: { id, etapaId: id, accionId: id, tareaId: id } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('externo CON invitación (lectura) al proyecto: pasa', async () => {
    mockPool([{ id_usuario: 'u-externo', rol: 'lectura' }]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-externo', rol: 'externo' }, params: { id, etapaId: id, accionId: id, tareaId: id } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('interno (p.ej. enlace) sin ninguna relación con el proyecto: pasa igual que antes de este cambio', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-enlace', rol: 'enlace' }, params: { id, etapaId: id, accionId: id, tareaId: id } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("'/conteo-descendientes' — exigirVisibilidadDeEntidadEnQuery()", () => {
  test('externo SIN invitación, entidad_tipo=Proyecto: 403', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await exigirVisibilidadDeEntidadEnQuery()(
      { usuario: { id: 'u-externo', rol: 'externo' }, query: { entidad_tipo: 'Proyecto', entidad_id: PROYECTO_A } },
      res, next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('externo SIN invitación, entidad_tipo=Etapa (mayúscula, como lo manda el frontend): 403', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await exigirVisibilidadDeEntidadEnQuery()(
      { usuario: { id: 'u-externo', rol: 'externo' }, query: { entidad_tipo: 'Etapa', entidad_id: ETAPA_A } },
      res, next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('externo CON invitación al proyecto, entidad_tipo=Accion: pasa', async () => {
    mockPool([{ id_usuario: 'u-externo', rol: 'lectura' }]);
    const res = crearRes();
    const next = jest.fn();

    await exigirVisibilidadDeEntidadEnQuery()(
      { usuario: { id: 'u-externo', rol: 'externo' }, query: { entidad_tipo: 'Accion', entidad_id: ACCION_A } },
      res, next
    );

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('interno sin relación: pasa igual que antes de este cambio', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await exigirVisibilidadDeEntidadEnQuery()(
      { usuario: { id: 'u-enlace', rol: 'enlace' }, query: { entidad_tipo: 'Proyecto', entidad_id: PROYECTO_A } },
      res, next
    );

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('sin entidad_tipo/entidad_id: deja pasar para que el controller dé su propio 400 (no es un caso de autorización)', async () => {
    const res = crearRes();
    const next = jest.fn();

    await exigirVisibilidadDeEntidadEnQuery()({ usuario: { id: 'u-externo', rol: 'externo' }, query: {} }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
