/**
 * ARCHIVO: catalogo-indicadores-eliminar.test.js
 * PROPÓSITO: Parte 1 del encargo sobre el catálogo de indicadores —
 *            DELETE /catalogo-indicadores/:id. Dos casos:
 *            (a) sin ningún proyecto vinculado → se borra de verdad;
 *            (b) con algún proyecto vinculado → se rechaza con 409 y
 *            NUNCA llega a borrar la fila, aunque la llamada venga
 *            directo a la API (no solo escondida tras el botón).
 *            El permiso de superadmin lo cubre router.delete con
 *            requiereRol (mismo middleware que ya protege PUT/PATCH de
 *            este recurso) — no hace falta un test aparte por ruta, el
 *            middleware es el mismo que el resto del archivo de rutas.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/pool', () => ({ query: jest.fn() }));

const pool = require('../db/pool');
const catalogoQueries = require('../db/queries/catalogo-indicadores.queries');

beforeEach(() => { jest.clearAllMocks(); });

describe('catalogoQueries.eliminar — capa de datos', () => {
  it('sin proyectos vinculados: borra la fila de verdad', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] }) // conteo de uso
      .mockResolvedValueOnce({ rows: [{ id: 'cat-1', nombre: 'Indicador sin uso' }] }); // DELETE

    const resultado = await catalogoQueries.eliminar('cat-1');

    expect(pool.query.mock.calls[1][0]).toMatch(/^DELETE FROM catalogo_indicadores/);
    expect(resultado).toEqual({ id: 'cat-1', nombre: 'Indicador sin uso' });
  });

  it('con proyectos vinculados: rechaza con EN_USO y nunca llega a borrar', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ n: 3 }] }); // conteo de uso

    await expect(catalogoQueries.eliminar('cat-2')).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'EN_USO',
      usos: 3,
    });
    // Solo la consulta de conteo corrió — nunca el DELETE.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /catalogo-indicadores/:id — controlador', () => {
  it('responde 409 (no 200) cuando la entrada está en uso', async () => {
    jest.resetModules();
    jest.doMock('../db/queries/catalogo-indicadores.queries', () => ({
      eliminar: jest.fn().mockRejectedValue(Object.assign(new Error('en uso'), { statusCode: 409, codigo: 'EN_USO', usos: 2 })),
    }));
    const ctrl = require('../controllers/catalogo-indicadores.controller');
    const req = { params: { id: 'cat-2' } };
    const res = { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await ctrl.eliminar(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: true, codigo: 'EN_USO' });
    expect(next).not.toHaveBeenCalled();
    jest.dontMock('../db/queries/catalogo-indicadores.queries');
  });

  it('responde 200 con el nombre cuando el borrado sí procede', async () => {
    jest.resetModules();
    jest.doMock('../db/queries/catalogo-indicadores.queries', () => ({
      eliminar: jest.fn().mockResolvedValue({ id: 'cat-1', nombre: 'Indicador sin uso' }),
    }));
    const ctrl = require('../controllers/catalogo-indicadores.controller');
    const req = { params: { id: 'cat-1' } };
    const res = { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await ctrl.eliminar(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ datos: { id: 'cat-1', nombre: 'Indicador sin uso' } });
    jest.dontMock('../db/queries/catalogo-indicadores.queries');
  });
});
