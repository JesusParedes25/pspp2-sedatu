/**
 * ARCHIVO: nodo-miembros-cambio-funcion.test.js
 * PROPÓSITO: nodo-miembros.controller.js::actualizar — mismo hueco que
 *            miembros.controller.js::agregarMiembro (ver
 *            agregar-miembro-cambio-funcion.test.js) pero a nivel nodo:
 *            antes de esta ronda, reasignar la función de alguien ya
 *            ACEPTADO en una etapa/acción/tarea actualizaba la bitácora
 *            pero no avisaba nada a la persona afectada. Ver
 *            docs/modelo-permisos.md, sección 15.2.
 *
 * Ejecutar: npm test
 */
const ETAPA = '00000000-0000-0000-0000-00000000d001';
const ACTOR = '00000000-0000-0000-0000-00000000d002';
const OBJETIVO = '00000000-0000-0000-0000-00000000d003';
const PROYECTO = '00000000-0000-0000-0000-00000000d004';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../db/pool', () => ({
  query: jest.fn((sql) => {
    if (/FROM etapas WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [{ nombre: 'Etapa de prueba' }] });
    if (/FROM usuarios WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [{ nombre_completo: 'Objetivo Persona' }] });
    return Promise.resolve({ rows: [] });
  }),
}));
jest.mock('../db/queries/nodo-miembros.queries', () => ({
  obtenerMiembro: jest.fn(),
  actualizarRol: jest.fn(),
}));
jest.mock('../db/queries/miembros.queries', () => ({}));
jest.mock('../utils/autorizacion', () => ({
  puedeGestionarParticipantesNodo: jest.fn().mockResolvedValue(true),
  obtenerProyectoIdDeNodo: jest.fn().mockResolvedValue(PROYECTO),
}));
jest.mock('../utils/validar-funcion-lectura', () => ({
  rechazoLecturaParaInterno: jest.fn().mockResolvedValue(null),
}));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));

const nodoMiembrosQueries = require('../db/queries/nodo-miembros.queries');
const { crearNotificacion } = require('../utils/notificaciones');
const { actualizar } = require('../controllers/nodo-miembros.controller');

beforeEach(() => { jest.clearAllMocks(); });

function req(rol) {
  return { params: { etapaId: ETAPA, userId: OBJETIVO }, body: { rol }, usuario: { id: ACTOR, nombre_completo: 'Quien cambia' } };
}

test('cambio de función real a nivel nodo: ya ACEPTADO con otro rol — notifica "cambió tu función"', async () => {
  nodoMiembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
  nodoMiembrosQueries.actualizarRol.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'responsable' });
  const res = crearRes();

  await actualizar(req('responsable'), res, jest.fn());

  expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
    tipo: 'PermisoNuevo',
    mensaje: expect.stringMatching(/cambió tu función.*Ahora eres Responsable/),
    idUsuario: OBJETIVO,
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: true }));
});

test('todavía pendiente de aceptar a nivel nodo: no es un "cambio de función", no notifica', async () => {
  nodoMiembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'pendiente', rol: 'captura' });
  nodoMiembrosQueries.actualizarRol.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'responsable' });
  const res = crearRes();

  await actualizar(req('responsable'), res, jest.fn());

  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: false }));
});

test('sin fila previa a nivel nodo: no notifica como cambio de función', async () => {
  nodoMiembrosQueries.obtenerMiembro.mockResolvedValue(null);
  nodoMiembrosQueries.actualizarRol.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });
  const res = crearRes();

  await actualizar(req('captura'), res, jest.fn());

  expect(crearNotificacion).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cambio_rol: false }));
});
