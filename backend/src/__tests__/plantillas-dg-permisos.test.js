/**
 * ARCHIVO: plantillas-dg-permisos.test.js
 * PROPÓSITO: Fase 2, Paso 0 del modelo de permisos (docs/modelo-permisos.md)
 *            — bug 3: PUT/DELETE /plantillas-importacion/:id solo
 *            bloqueaban tocar la plantilla predeterminada del sistema,
 *            sin importar de qué DG fuera el usuario ni de qué DG fuera
 *            la plantilla. Ahora exige ser de la misma DG que la
 *            plantilla, o superadmin. Lectura (listar/obtener/descargar)
 *            no cambia.
 *
 * Ejecutar: npm test
 */

const UUID_PLANTILLA = '00000000-0000-0000-0000-000000000001';
const UUID_DG_A = '00000000-0000-0000-0000-00000000000a';
const UUID_DG_B = '00000000-0000-0000-0000-00000000000b';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('xlsx', () => ({}));
jest.mock('../utils/contentDisposition', () => ({ setContentDisposition: jest.fn() }));

const pool = require('../db/pool');
const plantillasController = require('../controllers/plantillas.controller');

beforeEach(() => jest.clearAllMocks());

describe('PUT /plantillas-importacion/:id — actualizar', () => {
  test('usuario de otra DG, 403 y nunca llega al UPDATE', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, id_dg: UUID_DG_A, es_predeterminada: false }] });
    const req = { usuario: { id_dg: UUID_DG_B, rol: 'responsable' }, params: { id: UUID_PLANTILLA }, body: { nombre: 'Nueva' } };
    const res = crearRes();
    const next = jest.fn();

    await plantillasController.actualizar(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NO_AUTORIZADO' }));
    expect(pool.query).toHaveBeenCalledTimes(1); // solo el SELECT, nunca el UPDATE
  });

  test('misma DG que la plantilla, se permite', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, id_dg: UUID_DG_A, es_predeterminada: false }] })
      .mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, nombre: 'Nueva' }] });
    const req = { usuario: { id_dg: UUID_DG_A, rol: 'responsable' }, params: { id: UUID_PLANTILLA }, body: { nombre: 'Nueva' } };
    const res = crearRes();
    const next = jest.fn();

    await plantillasController.actualizar(req, res, next);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('superadmin de otra DG, se permite igual', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, id_dg: UUID_DG_A, es_predeterminada: false }] })
      .mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, nombre: 'Nueva' }] });
    const req = { usuario: { id_dg: UUID_DG_B, rol: 'superadmin' }, params: { id: UUID_PLANTILLA }, body: { nombre: 'Nueva' } };
    const res = crearRes();
    const next = jest.fn();

    await plantillasController.actualizar(req, res, next);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

describe('DELETE /plantillas-importacion/:id — eliminar', () => {
  test('usuario de otra DG, 403 y nunca llega al DELETE', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, id_dg: UUID_DG_A, es_predeterminada: false }] });
    const req = { usuario: { id_dg: UUID_DG_B, rol: 'responsable' }, params: { id: UUID_PLANTILLA } };
    const res = crearRes();
    const next = jest.fn();

    await plantillasController.eliminar(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NO_AUTORIZADO' }));
    expect(pool.query).toHaveBeenCalledTimes(1); // solo el SELECT, nunca el DELETE
  });

  test('misma DG que la plantilla, se permite', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: UUID_PLANTILLA, id_dg: UUID_DG_A, es_predeterminada: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = { usuario: { id_dg: UUID_DG_A, rol: 'responsable' }, params: { id: UUID_PLANTILLA } };
    const res = crearRes();
    const next = jest.fn();

    await plantillasController.eliminar(req, res, next);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
