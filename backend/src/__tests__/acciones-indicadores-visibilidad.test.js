/**
 * ARCHIVO: acciones-indicadores-visibilidad.test.js
 * PROPÓSITO: paso 11 DGTIC (A01) — las dos rutas que el paso 10 reportó
 *            sin tocar (mismo hueco que las cinco que sí se cerraron
 *            entonces, pero fuera de lo pedido en ese paso):
 *              GET /acciones/:id/indicadores
 *              GET /indicadores/:id/resumen-aportaciones
 *            Ninguna llevaba candado de visibilidad: un 'externo' sin
 *            relación con el proyecto las leía igual que cualquier
 *            interno. Ahora llevan el mismo middleware que ya exige su
 *            endpoint hermano (el PUT de /acciones/:id/indicadores, y el
 *            GET de /indicadores/:id respectivamente).
 *
 * Mismo criterio que riesgos-indicadores-visibilidad.test.js: se
 * verifica la línea de la ruta por código fuente y se ejercita el
 * middleware real importado directo de alcance-lectura.js.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const path = require('path');

const RUTAS = [
  { ruta: "'/acciones/:id/indicadores'", middleware: "exigirVisibilidadNodo('accion')" },
  { ruta: "'/indicadores/:id/resumen-aportaciones'", middleware: 'exigirVisibilidadIndicador()' },
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
const { exigirVisibilidadNodo, exigirVisibilidadIndicador } = require('../utils/alcance-lectura');

const PROYECTO_A = '00000000-0000-0000-0000-0000000000c1';
const ACCION_A = '00000000-0000-0000-0000-0000000000c2';
const INDICADOR_A = '00000000-0000-0000-0000-0000000000c3';

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
    if (/FROM acciones WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_etapa: null }] });
    }
    if (/FROM indicadores WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => jest.clearAllMocks());

const CASOS = [
  { nombre: 'indicadores de una acción', mw: () => exigirVisibilidadNodo('accion'), id: ACCION_A },
  { nombre: 'resumen de aportaciones de un indicador', mw: () => exigirVisibilidadIndicador(), id: INDICADOR_A },
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
