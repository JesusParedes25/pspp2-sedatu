/**
 * ARCHIVO: agregar-miembro-cambio-funcion.test.js
 * PROPÓSITO: miembros.controller.js::agregarMiembro — distinguir un
 *            cambio de función real (alguien YA ACEPTADO, función
 *            distinta) de una primera invitación (nada previo, o
 *            todavía pendiente de aceptar). Antes de esta ronda, el
 *            único camino real de la UI a este endpoint
 *            (ParticipanteCard::onCambiarRol, siempre sobre alguien ya
 *            aceptado) disparaba SIEMPRE el texto de "te invitó a
 *            participar... puedes aceptar o rechazar" — incorrecto
 *            para un cambio de función ya aplicado. Ver
 *            docs/modelo-permisos.md, sección 15.2.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-00000000c001';
const ACTOR = '00000000-0000-0000-0000-00000000c002';
const OBJETIVO = '00000000-0000-0000-0000-00000000c003';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ nombre: 'Proyecto de prueba', siglas: 'DG' }] }) }));
jest.mock('../db/queries/miembros.queries', () => ({
  obtenerMiembro: jest.fn(),
  agregarMiembro: jest.fn(),
  esUnicoAdministrador: jest.fn().mockResolvedValue(false),
}));
jest.mock('../utils/autorizacion', () => ({
  resolverAccesoProyecto: jest.fn().mockResolvedValue({ permitido: true, via: 'responsable' }),
}));
jest.mock('../utils/validar-funcion-lectura', () => ({
  rechazoLecturaParaInterno: jest.fn().mockResolvedValue(null),
}));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));

const miembrosQueries = require('../db/queries/miembros.queries');
const { registrarActividad } = require('../utils/actividad-log');
const { crearNotificacion } = require('../utils/notificaciones');
const { agregarMiembro } = require('../controllers/miembros.controller');

beforeEach(() => {
  jest.clearAllMocks();
  miembrosQueries.esUnicoAdministrador.mockResolvedValue(false);
});

function req(rol) {
  return { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO, rol }, usuario: { id: ACTOR, nombre_completo: 'Quien cambia' } };
}

test('cambio de función real: alguien ya ACEPTADO con otro rol — notifica "cambió tu función", no "te invitó"', async () => {
  miembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
  miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'responsable' });
  const res = crearRes();

  await agregarMiembro(req('responsable'), res, jest.fn());

  expect(registrarActividad).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Función actualizada' }));
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
    tipo: 'PermisoNuevo',
    mensaje: expect.stringMatching(/cambió tu función.*Ahora eres Responsable/),
    idUsuario: OBJETIVO,
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: true }));
});

test('primera asignación: sin fila previa — sigue siendo "te invitó", no "cambió tu función"', async () => {
  miembrosQueries.obtenerMiembro.mockResolvedValue(null);
  miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });
  const res = crearRes();

  await agregarMiembro(req('captura'), res, jest.fn());

  expect(registrarActividad).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Nuevo miembro agregado al proyecto' }));
  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
    tipo: 'Invitacion',
    mensaje: expect.stringMatching(/te invitó a participar.*como Colaborador/),
    idUsuario: OBJETIVO,
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: false }));
});

test('todavía PENDIENTE de aceptar: cambiarle el rol antes de que acepte sigue siendo "te invitó", no "cambió tu función"', async () => {
  miembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'pendiente', rol: 'captura' });
  miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'responsable' });
  const res = crearRes();

  await agregarMiembro(req('responsable'), res, jest.fn());

  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'Invitacion' }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: false }));
});

test('sin cambio real (mismo rol, ya aceptado): no notifica ni registra bitácora', async () => {
  miembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
  miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });
  const res = crearRes();

  await agregarMiembro(req('captura'), res, jest.fn());

  expect(registrarActividad).not.toHaveBeenCalled();
  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: false }));
});
