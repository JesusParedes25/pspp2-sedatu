/**
 * ARCHIVO: riesgos-indicadores-visibilidad.test.js
 * PROPÓSITO: paso 10 DGTIC (A01) — cinco rutas de lectura por nodo no
 *            llevaban ningún candado de visibilidad: un 'externo' sin
 *            relación con el proyecto las leía igual que cualquier
 *            interno. La nota de alcance que las dejaba así (routes/index.js,
 *            antes de este cambio) citaba solo una razón de ALCANCE de un
 *            PR anterior ("no están en la lista pedida"), nunca una razón
 *            de funcionamiento — confirmado antes de tocar nada: el
 *            frontend siempre llama a estas rutas con un id de nodo ya
 *            resuelto (frontend/src/api/riesgos.js, frontend/src/api/etapas.js),
 *            nunca antes de tener ese contexto. Ahora llevan
 *            exigirVisibilidadNodo(), el mismo candado que ya usan los
 *            endpoints equivalentes de evidencias/aportaciones.
 *
 * Mismo criterio que exportar-visibilidad.test.js: no se requiere
 * routes/index.js completo (evidencias.controller.js dispara una llamada
 * real de red a MinIO al cargarse) — se verifica la línea de la ruta por
 * código fuente y se ejercita el middleware real importado directo de
 * alcance-lectura.js.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const path = require('path');

const RUTAS = [
  { ruta: "'/etapas/:id/riesgos'", middleware: "exigirVisibilidadNodo('etapa')" },
  { ruta: "'/acciones/:id/riesgos'", middleware: "exigirVisibilidadNodo('accion')" },
  { ruta: "'/subacciones/:id/riesgos'", middleware: "exigirVisibilidadNodo('accion')" },
  { ruta: "'/tareas/:id/riesgos'", middleware: "exigirVisibilidadNodo('tarea')" },
  { ruta: "'/etapas/:id/indicadores'", middleware: "exigirVisibilidadNodo('etapa')" },
];

describe.each(RUTAS)('$ruta declara $middleware antes del controller', ({ ruta, middleware }) => {
  test('verificado por código fuente', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '../routes/index.js'), 'utf8');
    const linea = fuente.split('\n').find(l => l.includes(ruta));
    expect(linea).toBeDefined();
    expect(linea).toContain(middleware);
  });
});

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { exigirVisibilidadNodo } = require('../utils/alcance-lectura');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000b1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000b2';
const ACCION_A = '00000000-0000-0000-0000-0000000000b3';
const TAREA_A = '00000000-0000-0000-0000-0000000000b4';

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

const CASOS = [
  { nombre: 'riesgos de etapa', mw: () => exigirVisibilidadNodo('etapa'), id: ETAPA_A },
  { nombre: 'riesgos de acción (y subacción, misma resolución)', mw: () => exigirVisibilidadNodo('accion'), id: ACCION_A },
  { nombre: 'riesgos de tarea', mw: () => exigirVisibilidadNodo('tarea'), id: TAREA_A },
  { nombre: 'indicadores de etapa', mw: () => exigirVisibilidadNodo('etapa'), id: ETAPA_A },
];

describe.each(CASOS)('$nombre — el candado real', ({ mw, id }) => {
  test('externo SIN invitación al proyecto: 403, nunca llega al controller', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-externo', rol: 'externo' }, params: { id } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('externo CON invitación (lectura) al proyecto: pasa', async () => {
    mockPool([{ id_usuario: 'u-externo', rol: 'lectura' }]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-externo', rol: 'externo' }, params: { id } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('interno (p.ej. enlace) sin ninguna relación con el proyecto: pasa igual que antes de este cambio', async () => {
    mockPool([]);
    const res = crearRes();
    const next = jest.fn();

    await mw()({ usuario: { id: 'u-enlace', rol: 'enlace' }, params: { id } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
