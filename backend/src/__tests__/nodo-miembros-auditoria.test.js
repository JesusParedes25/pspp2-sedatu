/**
 * ARCHIVO: nodo-miembros-auditoria.test.js
 * PROPÓSITO: Verifica que agregar/cambiar de rol/quitar a alguien del
 *            equipo de una etapa/acción/tarea (nodo-miembros.controller.js)
 *            quede registrado en la bitácora oficial `auditoria` — punto
 *            2 del paso 7 DGTIC (continuación del paso 6). `eliminar`
 *            en particular no tenía NINGÚN registro, en ninguna
 *            bitácora, antes de este cambio — mismo hueco que ya se
 *            cerró a nivel proyecto en el paso 6.
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
  agregarMiembro: jest.fn(),
  actualizarRol: jest.fn(),
  eliminarMiembro: jest.fn(),
}));
jest.mock('../db/queries/miembros.queries', () => ({ obtenerRolUsuario: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/autorizacion', () => ({
  puedeGestionarParticipantesNodo: jest.fn().mockResolvedValue(true),
  obtenerProyectoIdDeNodo: jest.fn().mockResolvedValue(PROYECTO),
}));
jest.mock('../utils/validar-funcion-lectura', () => ({
  rechazoLecturaParaInterno: jest.fn().mockResolvedValue(null),
}));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/notificaciones', () => ({ crearNotificacion: jest.fn() }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const nodoMiembrosQueries = require('../db/queries/nodo-miembros.queries');
const { registrarAuditoria } = require('../utils/auditoria');
const { agregar, actualizar, eliminar } = require('../controllers/nodo-miembros.controller');

beforeEach(() => { jest.clearAllMocks(); });

function reqBase(extra) {
  return { params: { etapaId: ETAPA, userId: OBJETIVO }, usuario: { id: ACTOR, nombre_completo: 'Actor' }, body: {}, ...extra };
}

describe('agregar', () => {
  test('audita INSERT con la fila completa', async () => {
    nodoMiembrosQueries.agregarMiembro.mockResolvedValue({ id: 'nm-1', id_usuario: OBJETIVO, rol: 'captura' });

    const req = reqBase({ body: { id_usuario: OBJETIVO, rol: 'captura' } });
    await agregar(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'nodo_miembros', registroId: 'nm-1', campoModificado: 'fila',
      valorNuevo: { id: 'nm-1', id_usuario: OBJETIVO, rol: 'captura' }, operacion: 'INSERT', idUsuario: ACTOR
    });
  });
});

describe('actualizar (cambio de rol)', () => {
  test('audita UPDATE con rol anterior y nuevo', async () => {
    nodoMiembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
    nodoMiembrosQueries.actualizarRol.mockResolvedValue({ id: 'nm-1', id_usuario: OBJETIVO, rol: 'responsable' });

    const req = reqBase({ body: { rol: 'responsable' } });
    await actualizar(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'nodo_miembros', registroId: 'nm-1', campoModificado: 'rol',
      valorAnterior: 'captura', valorNuevo: 'responsable', operacion: 'UPDATE', idUsuario: ACTOR
    });
  });

  test('miembro no encontrado: no audita', async () => {
    nodoMiembrosQueries.obtenerMiembro.mockResolvedValue(null);
    nodoMiembrosQueries.actualizarRol.mockResolvedValue(null);

    const req = reqBase({ body: { rol: 'responsable' } });
    const res = crearRes();
    await actualizar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('eliminar', () => {
  test('audita DELETE con la fila completa que tenía, ANTES de que desaparezca', async () => {
    const previo = { id: 'nm-1', id_usuario: OBJETIVO, rol: 'captura' };
    nodoMiembrosQueries.obtenerMiembro.mockResolvedValue(previo);
    nodoMiembrosQueries.eliminarMiembro.mockResolvedValue({ id: 'nm-1' });

    const req = reqBase();
    await eliminar(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'nodo_miembros', registroId: 'nm-1', campoModificado: 'fila',
      valorAnterior: previo, operacion: 'DELETE', idUsuario: ACTOR
    });
  });

  test('miembro no encontrado: no audita', async () => {
    nodoMiembrosQueries.obtenerMiembro.mockResolvedValue(null);

    const req = reqBase();
    const res = crearRes();
    await eliminar(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(nodoMiembrosQueries.eliminarMiembro).not.toHaveBeenCalled();
  });
});
