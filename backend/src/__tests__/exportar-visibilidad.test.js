/**
 * ARCHIVO: exportar-visibilidad.test.js
 * PROPÓSITO: Fase 4/parte A del modelo de permisos (docs/modelo-permisos.md,
 *            matriz de capacidades, fila "Exportar") — `GET
 *            /proyectos/:id/exportar` no tenía NINGÚN candado de
 *            visibilidad: cualquier usuario autenticado, incluido un
 *            'externo' sin relación con el proyecto, podía exportar su
 *            estructura completa. Ahora lleva `exigirVisibilidadProyecto()`,
 *            el mismo mecanismo que ya protege el resto de la lectura
 *            estructural (Fase 2/Paso 1, alcance-lectura.test.js — no se
 *            repite aquí esa prueba).
 *
 * No se requiere routes/index.js completo a propósito: ese archivo
 * importa, entre otras cosas, evidencias.controller.js, que dispara una
 * llamada real de red (inicializar el bucket de MinIO) al cargarse —
 * son efectos secundarios reales, no solo imports, y no pertenecen a una
 * suite de permisos. En su lugar, esta prueba lee el código fuente de la
 * ruta (verificación estática) y, por separado, ejercita el middleware
 * real (importado directo de alcance-lectura.js, sin mocks de la
 * escalera) para confirmar su comportamiento ante 'externo' vs. interno
 * — exactamente lo que la ruta aplicaría si el middleware real está ahí.
 *
 * Ejecutar: npm test
 */
const fs = require('fs');
const path = require('path');

test('la ruta GET /proyectos/:id/exportar declara exigirVisibilidadProyecto() antes del controller', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../routes/index.js'), 'utf8');
  const linea = fuente.split('\n').find(l => l.includes("'/proyectos/:id/exportar'"));
  expect(linea).toBeDefined();
  expect(linea).toMatch(/exigirVisibilidadProyecto\(\)/);
});

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { exigirVisibilidadProyecto } = require('../utils/alcance-lectura');

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => jest.clearAllMocks());

test('el candado real rechaza a un externo sin relación con el proyecto', async () => {
  pool.query.mockImplementation((sql) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    if (/FROM proyecto_usuarios/.test(sql)) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });

  const middleware = exigirVisibilidadProyecto();
  const req = { usuario: { id: 'u-externo', rol: 'externo' }, params: { id: 'proyecto-cualquiera' } };
  const res = crearRes();
  const next = jest.fn();

  await middleware(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
});

test('el candado real deja pasar a un interno (p.ej. enlace) sin relación con el proyecto', async () => {
  pool.query.mockImplementation((sql) => {
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    return Promise.resolve({ rows: [] });
  });

  const middleware = exigirVisibilidadProyecto();
  const req = { usuario: { id: 'u-enlace', rol: 'enlace' }, params: { id: 'proyecto-cualquiera' } };
  const res = crearRes();
  const next = jest.fn();

  await middleware(req, res, next);

  expect(next).toHaveBeenCalledWith();
  expect(res.status).not.toHaveBeenCalled();
});
