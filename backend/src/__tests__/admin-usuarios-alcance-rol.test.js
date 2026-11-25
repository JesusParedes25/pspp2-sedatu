/**
 * ARCHIVO: admin-usuarios-alcance-rol.test.js
 * PROPÓSITO: paso 15 DGTIC, CAMBIO 1 — crear/editar un usuario con rol
 *            'direccion' exige una Dirección de Área; con rol
 *            'direccion_general' exige una Dirección General. Sin eso,
 *            la cuenta se guardaba (antes de esta prueba) pero se
 *            quedaba sin ver ningún proyecto, sin ningún aviso de por
 *            qué — el bono de 'direccion' bajó de nivel DG a nivel
 *            Dirección de Área (utils/alcanceProyectos.js,
 *            utils/funcion-efectiva.js), y antes de ese cambio la
 *            cuenta sin área todavía veía algo por DG.
 *
 * Mismo patrón que admin-usuarios-auditoria.test.js: se llama al
 * controller directo, con pool.query mockeado a mano.
 */
const mockPoolQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockPoolQuery(...args) }));
jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hash-temporal') }));
jest.mock('../middleware/subidaArchivo.middleware', () => ({ limpiarArchivoTemporal: jest.fn() }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));
jest.mock('../utils/correo', () => ({ enviarCorreo: jest.fn().mockResolvedValue({ enviado: true }) }));
jest.mock('../utils/correoTextos', () => ({ invitacion: jest.fn().mockReturnValue({ asunto: 'x', texto: 'y' }) }));

const { registrarAuditoria } = require('../utils/auditoria');
const { enviarCorreo } = require('../utils/correo');
const { crearUsuario, editarUsuario } = require('../controllers/admin.controller');

const USR_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR_ID = '00000000-0000-0000-0000-00000000000a';
const DG_1 = 'dg-1';
const AREA_1 = 'area-1';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  mockPoolQuery.mockReset();
  registrarAuditoria.mockClear();
  enviarCorreo.mockClear();
});

describe('crearUsuario — rechaza rol sin su alcance correspondiente', () => {
  test('direccion sin id_direccion_area: 400, sin tocar la BD', async () => {
    const req = { body: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', rol: 'direccion', id_dg: DG_1 } };
    const res = crearRes();
    await crearUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('Dirección de Área') }));
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  test('direccion_general sin id_dg: 400, sin tocar la BD', async () => {
    const req = { body: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', rol: 'direccion_general' } };
    const res = crearRes();
    await crearUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('Dirección General') }));
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  test('direccion CON id_direccion_area: pasa la validación y llega a crear la cuenta', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT id FROM usuarios WHERE correo = ... (no existe)
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion' }] }) // INSERT usuarios
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1' }] }); // INSERT tokens_activacion

    const req = { body: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 } };
    const res = crearRes();
    await crearUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('direccion_general CON id_dg: pasa la validación y llega a crear la cuenta', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion_general' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1' }] });

    const req = { body: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', rol: 'direccion_general', id_dg: DG_1 } };
    const res = crearRes();
    await crearUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test.each(['superadmin', 'ejecutivo', 'enlace', 'externo'])('%s sin DG ni área: no se le exige nada (regresión)', async (rol) => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1' }] });

    const req = { body: { nombre_completo: 'X', correo: 'x@sedatu.gob.mx', rol } };
    const res = crearRes();
    await crearUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('editarUsuario — valida el rol/DG/área RESULTANTE, no solo lo que llega en esta petición', () => {
  test('cambiar el rol a direccion sin tener ya un área asignada: 400, no actualiza', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'enlace', id_dg: null, id_direccion_area: null }],
    });

    const req = { params: { id: USR_ID }, body: { rol: 'direccion' }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('Dirección de Área') }));
    expect(mockPoolQuery).toHaveBeenCalledTimes(1); // solo el SELECT "antes", nunca el UPDATE
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test('cambiar el rol a direccion Y el área en la misma petición: pasa', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'enlace', id_dg: null, id_direccion_area: null }] })
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 }] });

    const req = { params: { id: USR_ID }, body: { rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: 'Usuario actualizado' }));
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });

  test('ya es direccion CON área, y esta petición solo cambia el nombre: no vuelve a exigir nada (usa el área ya guardada)', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 }] })
      .mockResolvedValueOnce({ rows: [{ id: USR_ID, nombre_completo: 'Y', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 }] });

    const req = { params: { id: USR_ID }, body: { nombre_completo: 'Y' }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: 'Usuario actualizado' }));
  });

  test('ya es direccion CON área, y esta petición le quita el área (la pone vacía): 400, no actualiza', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'direccion', id_dg: DG_1, id_direccion_area: AREA_1 }],
    });

    const req = { params: { id: USR_ID }, body: { id_direccion_area: '' }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test('cambiar el rol a direccion_general sin DG: 400, no actualiza', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ nombre_completo: 'X', correo: 'x@sedatu.gob.mx', cargo: null, rol: 'enlace', id_dg: null, id_direccion_area: null }],
    });

    const req = { params: { id: USR_ID }, body: { rol: 'direccion_general' }, usuario: { id: ACTOR_ID } };
    const res = crearRes();
    await editarUsuario(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('Dirección General') }));
  });
});
