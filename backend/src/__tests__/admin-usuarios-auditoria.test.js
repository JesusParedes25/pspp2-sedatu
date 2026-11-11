/**
 * ARCHIVO: admin-usuarios-auditoria.test.js
 * PROPÓSITO: Verifica que editar la ficha de un usuario (rol, DG...),
 *            activar/desactivar su cuenta, y eliminarla permanentemente
 *            (admin.controller.js) queden registrados en la bitácora
 *            oficial `auditoria` — antes ninguna de las tres dejaba
 *            rastro en NINGÚN lado, el hueco más serio del punto 2 del
 *            paso 6 DGTIC: es el cambio de permisos más sensible de la
 *            plataforma (quién puede ser superadmin).
 */
const mockPoolQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockPoolQuery(...args) }));
jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
jest.mock('../middleware/subidaArchivo.middleware', () => ({ limpiarArchivoTemporal: jest.fn() }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const { registrarAuditoria } = require('../utils/auditoria');
const { editarUsuario, toggleUsuario, eliminarUsuario } = require('../controllers/admin.controller');

const USR_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR_ID = '00000000-0000-0000-0000-00000000000a';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  mockPoolQuery.mockReset();
  registrarAuditoria.mockClear();
});

describe('editarUsuario', () => {
  test('cambio de rol: audita ficha anterior/nueva', async () => {
    const antes = { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: 'Analista', rol: 'direccion', id_dg: 'dg-1', id_direccion_area: null };
    const despues = { id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: 'Analista', rol: 'superadmin', id_dg: 'dg-1', id_direccion_area: null };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [antes] }) // SELECT antes
      .mockResolvedValueOnce({ rows: [despues] }); // UPDATE ... RETURNING

    const req = { params: { id: USR_ID }, body: { rol: 'superadmin' }, usuario: { id: ACTOR_ID } };
    await editarUsuario(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'usuarios', registroId: USR_ID, campoModificado: 'ficha',
      valorAnterior: antes,
      valorNuevo: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: 'Analista', rol: 'superadmin', id_dg: 'dg-1', id_direccion_area: null },
      operacion: 'UPDATE', idUsuario: ACTOR_ID
    });
  });

  test('usuario inexistente: no audita', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT antes: no existe
      .mockResolvedValueOnce({ rows: [] }); // UPDATE: 0 filas

    const req = { params: { id: USR_ID }, body: { rol: 'superadmin' }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('toggleUsuario', () => {
  test('desactivar: audita activo true -> false', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: USR_ID, activo: false }] });

    const req = { params: { id: USR_ID }, usuario: { id: ACTOR_ID } };
    await toggleUsuario(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'usuarios', registroId: USR_ID, campoModificado: 'activo',
      valorAnterior: true, valorNuevo: false, operacion: 'UPDATE', idUsuario: ACTOR_ID
    });
  });

  test('activar: audita activo false -> true', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: USR_ID, activo: true }] });

    const req = { params: { id: USR_ID }, usuario: { id: ACTOR_ID } };
    await toggleUsuario(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
      valorAnterior: false, valorNuevo: true
    }));
  });
});

describe('eliminarUsuario', () => {
  test('audita DELETE con la fila completa ANTES de borrar', async () => {
    const previo = { id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: 'Analista', rol: 'captura', id_dg: null, id_direccion_area: null, activo: true };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [previo] }) // SELECT previo
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx' }] }); // DELETE

    const req = { params: { id: USR_ID }, usuario: { id: ACTOR_ID } };
    await eliminarUsuario(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'usuarios', registroId: USR_ID, campoModificado: 'fila',
      valorAnterior: previo, operacion: 'DELETE', idUsuario: ACTOR_ID
    });

    const llamadas = mockPoolQuery.mock.calls;
    const idxDelete = llamadas.findIndex(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM usuarios'));
    expect(idxDelete).toBe(1); // la auditoría (mock aparte) se esperó antes de este DELETE
  });

  test('no se puede eliminar la propia cuenta: no audita', async () => {
    const req = { params: { id: ACTOR_ID }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await eliminarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  test('usuario inexistente: no audita ni borra', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // SELECT previo: no existe

    const req = { params: { id: USR_ID }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await eliminarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });
});
