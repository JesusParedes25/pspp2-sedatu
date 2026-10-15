/**
 * ARCHIVO: transferir-administracion-controller.test.js
 * PROPÓSITO: miembros.controller.js::transferirAdministracionProyecto —
 *            el controller detrás de PATCH /admin/proyectos/:id/administrador.
 *            La transacción real (las 4 validaciones) se prueba aparte en
 *            transferir-administracion.test.js, directo sobre
 *            miembros.queries.js — aquí se mockea esa función para probar
 *            solo la capa del controller: el 400 por campo faltante, el
 *            happy path (bitácora + 2 notificaciones), y que un error
 *            tipado de la query (p. ej. DESTINATARIO_EXTERNO) llega a
 *            next(err) sin que el controller lo intercepte.
 *
 * El chequeo de rol=superadmin ya lo hace requiereRol(['superadmin']) en
 * admin.routes.js, antes de llegar aquí — no se repite ni se vuelve a
 * probar en este archivo.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-00000000b001';
const SUPERADMIN = '00000000-0000-0000-0000-00000000b002';
const SALIENTE = '00000000-0000-0000-0000-00000000b003';
const DESTINO = '00000000-0000-0000-0000-00000000b004';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../db/queries/miembros.queries', () => ({ transferirAdministracion: jest.fn() }));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));

const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');
const { registrarActividad } = require('../utils/actividad-log');
const { crearNotificacion } = require('../utils/notificaciones');
const { transferirAdministracionProyecto } = require('../controllers/miembros.controller');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [{ nombre: 'Proyecto de prueba' }] });
});

test('400 CAMPOS_REQUERIDOS si falta id_usuario en el body — nunca llega a tocar la BD', async () => {
  const req = { params: { id: PROYECTO }, body: {}, usuario: { id: SUPERADMIN, nombre_completo: 'Super' } };
  const res = crearRes();
  await transferirAdministracionProyecto(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'CAMPOS_REQUERIDOS' }));
  expect(miembrosQueries.transferirAdministracion).not.toHaveBeenCalled();
});

test('happy path: transfiere, registra bitácora y notifica a ambas personas', async () => {
  miembrosQueries.transferirAdministracion.mockResolvedValue({
    administradoresAnteriores: [SALIENTE],
    nuevoAdministrador: DESTINO,
    nombreNuevoAdministrador: 'Destino Persona',
  });

  const req = { params: { id: PROYECTO }, body: { id_usuario: DESTINO }, usuario: { id: SUPERADMIN, nombre_completo: 'Super' } };
  const res = crearRes();
  await transferirAdministracionProyecto(req, res, jest.fn());

  expect(miembrosQueries.transferirAdministracion).toHaveBeenCalledWith(PROYECTO, DESTINO);
  expect(registrarActividad).toHaveBeenCalledWith(expect.objectContaining({
    id_proyecto: PROYECTO, tipo: 'miembro', entidad_tipo: 'Proyecto',
  }));
  // Una notificación para quien sale (SALIENTE) y otra para quien entra (DESTINO).
  expect(crearNotificacion).toHaveBeenCalledTimes(2);
  const idsNotificados = crearNotificacion.mock.calls.map(c => c[0].idUsuario);
  expect(idsNotificados.sort()).toEqual([SALIENTE, DESTINO].sort());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.any(String) }));
  expect(res.status).not.toHaveBeenCalledWith(400);
});

test('un error tipado de la query (ej. destinatario externo) se reenvía a next(), no lo traga el controller', async () => {
  const errorTipado = Object.assign(new Error('Un usuario externo no puede recibir la administración del proyecto.'), {
    statusCode: 400, codigo: 'DESTINATARIO_EXTERNO',
  });
  miembrosQueries.transferirAdministracion.mockRejectedValue(errorTipado);

  const req = { params: { id: PROYECTO }, body: { id_usuario: DESTINO }, usuario: { id: SUPERADMIN, nombre_completo: 'Super' } };
  const res = crearRes();
  const next = jest.fn();
  await transferirAdministracionProyecto(req, res, next);

  expect(next).toHaveBeenCalledWith(errorTipado);
  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(registrarActividad).not.toHaveBeenCalled();
});
