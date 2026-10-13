/**
 * ARCHIVO: geografia-cobertura-permisos.test.js
 * PROPÓSITO: Hueco 4.3 de la Fase 1 del modelo de permisos
 *            (docs/modelo-permisos.md) — POST/DELETE /cobertura no tenían
 *            ningún chequeo: cualquier usuario autenticado podía ligar o
 *            quitar territorio de cualquier nodo. Exigen captura, igual
 *            que las demás acciones de captura (avance, riesgos, documentos).
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_PROYECTO = '00000000-0000-0000-0000-000000000002';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/queries/geografia.queries', () => ({
  agregarCobertura: jest.fn(),
  eliminarCobertura: jest.fn(),
  obtenerCoberturaPorId: jest.fn(),
}));
jest.mock('../utils/autorizacion', () => ({
  tienePeldanoProyecto: jest.fn(),
  tienePeldanoNodo: jest.fn(),
}));

const geografiaQueries = require('../db/queries/geografia.queries');
const { tienePeldanoProyecto, tienePeldanoNodo } = require('../utils/autorizacion');
const geografiaController = require('../controllers/geografia.controller');

beforeEach(() => jest.clearAllMocks());

describe('POST /cobertura/:tipo/:id — agregarCobertura', () => {
  test('sin captura en el nodo, 403 y nunca llega al INSERT', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, params: { tipo: 'etapa', id: UUID_1 }, body: { id_estado: 'x' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.agregarCobertura(req, res, next);

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, 'etapa', UUID_1, 'captura');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(geografiaQueries.agregarCobertura).not.toHaveBeenCalled();
  });

  test("tipo 'proyecto' se verifica a nivel proyecto, no como nodo", async () => {
    tienePeldanoProyecto.mockResolvedValueOnce(true);
    geografiaQueries.agregarCobertura.mockResolvedValueOnce({ id: 'c1' });
    const req = { usuario: { id: UUID_1 }, params: { tipo: 'proyecto', id: UUID_PROYECTO }, body: { id_estado: 'x' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.agregarCobertura(req, res, next);

    expect(tienePeldanoProyecto).toHaveBeenCalledWith(req.usuario, UUID_PROYECTO, 'captura');
    expect(tienePeldanoNodo).not.toHaveBeenCalled();
    expect(geografiaQueries.agregarCobertura).toHaveBeenCalled();
  });

  test('con captura, agrega la cobertura normalmente', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(true);
    geografiaQueries.agregarCobertura.mockResolvedValueOnce({ id: 'c1' });
    const req = { usuario: { id: UUID_1 }, params: { tipo: 'etapa', id: UUID_1 }, body: { id_estado: 'x' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.agregarCobertura(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('DELETE /cobertura/:id — eliminarCobertura', () => {
  test('resuelve a qué nodo pertenece la fila ANTES de verificar permiso y borrar', async () => {
    geografiaQueries.obtenerCoberturaPorId.mockResolvedValueOnce({ id: 'c1', tipo_entidad: 'accion', id_entidad: UUID_1 });
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, params: { id: 'c1' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.eliminarCobertura(req, res, next);

    expect(geografiaQueries.obtenerCoberturaPorId).toHaveBeenCalledWith('c1');
    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, 'accion', UUID_1, 'captura');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(geografiaQueries.eliminarCobertura).not.toHaveBeenCalled();
  });

  test('fila inexistente: 404 sin intentar resolver permiso', async () => {
    geografiaQueries.obtenerCoberturaPorId.mockResolvedValueOnce(null);
    const req = { usuario: { id: UUID_1 }, params: { id: 'no-existe' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.eliminarCobertura(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(tienePeldanoNodo).not.toHaveBeenCalled();
  });

  test('con permiso, borra normalmente', async () => {
    geografiaQueries.obtenerCoberturaPorId.mockResolvedValueOnce({ id: 'c1', tipo_entidad: 'etapa', id_entidad: UUID_1 });
    tienePeldanoNodo.mockResolvedValueOnce(true);
    geografiaQueries.eliminarCobertura.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_1 }, params: { id: 'c1' } };
    const res = crearRes();
    const next = jest.fn();

    await geografiaController.eliminarCobertura(req, res, next);

    expect(geografiaQueries.eliminarCobertura).toHaveBeenCalledWith('c1');
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
