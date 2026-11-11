/**
 * ARCHIVO: miembros-auditoria.test.js
 * PROPÓSITO: Verifica que agregar/cambiar de función/quitar a un miembro
 *            de un proyecto, invitarlo directo, y transferir la
 *            administración (miembros.controller.js) queden registrados
 *            en la bitácora oficial `auditoria` — punto 2 del paso 6
 *            DGTIC. `eliminarMiembro` en particular no tenía NINGÚN
 *            registro, en ninguna bitácora, antes de este cambio.
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
  eliminarMiembro: jest.fn(),
  transferirAdministracion: jest.fn(),
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
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const miembrosQueries = require('../db/queries/miembros.queries');
const { registrarAuditoria } = require('../utils/auditoria');
const {
  agregarMiembro, eliminarMiembro, crearInvitacion, transferirAdministracionProyecto
} = require('../controllers/miembros.controller');

beforeEach(() => {
  jest.clearAllMocks();
  registrarAuditoria.mockResolvedValue('aud-id');
});

describe('agregarMiembro', () => {
  test('cambio de función real: audita UPDATE con rol anterior/nuevo', async () => {
    miembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
    miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'responsable' });

    const req = { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO, rol: 'responsable' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    await agregarMiembro(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'proyecto_usuarios', registroId: PROYECTO, campoModificado: 'rol',
      valorAnterior: { id_usuario: OBJETIVO, rol: 'captura' },
      valorNuevo: { id_usuario: OBJETIVO, rol: 'responsable' },
      operacion: 'UPDATE', idUsuario: ACTOR
    });
  });

  test('primera invitación (nada previo): audita INSERT', async () => {
    miembrosQueries.obtenerMiembro.mockResolvedValue(null);
    miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });

    const req = { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO, rol: 'captura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    await agregarMiembro(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'proyecto_usuarios', registroId: PROYECTO, campoModificado: 'miembro',
      valorNuevo: { id_usuario: OBJETIVO, rol: 'captura' }, operacion: 'INSERT', idUsuario: ACTOR
    });
  });

  test('sin cambio real (mismo rol ya aceptado): no audita', async () => {
    miembrosQueries.obtenerMiembro.mockResolvedValue({ estado: 'aceptada', rol: 'captura' });
    miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });

    const req = { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO, rol: 'captura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    await agregarMiembro(req, crearRes(), jest.fn());

    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('eliminarMiembro', () => {
  test('audita DELETE con el rol que tenía, ANTES de que la fila desaparezca (sin RETURNING)', async () => {
    miembrosQueries.obtenerMiembro.mockResolvedValue({ rol: 'captura' });
    miembrosQueries.eliminarMiembro.mockResolvedValue(true);

    const req = { params: { id: PROYECTO, userId: OBJETIVO }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    await eliminarMiembro(req, crearRes(), jest.fn());

    expect(miembrosQueries.obtenerMiembro).toHaveBeenCalledWith(PROYECTO, OBJETIVO);
    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'proyecto_usuarios', registroId: PROYECTO, campoModificado: 'miembro',
      valorAnterior: { id_usuario: OBJETIVO, rol: 'captura' }, operacion: 'DELETE', idUsuario: ACTOR
    });
  });

  test('miembro no encontrado: no audita', async () => {
    miembrosQueries.obtenerMiembro.mockResolvedValue(null);
    miembrosQueries.eliminarMiembro.mockResolvedValue(false);

    const req = { params: { id: PROYECTO, userId: OBJETIVO }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    const res = crearRes();
    await eliminarMiembro(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('crearInvitacion', () => {
  test('audita INSERT', async () => {
    const pool = require('../db/pool');
    pool.query.mockResolvedValueOnce({ rows: [] }); // "¿ya es miembro?" -> no
    miembrosQueries.agregarMiembro.mockResolvedValue({ id_usuario: OBJETIVO, rol: 'captura' });

    const req = { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO, rol: 'captura' }, usuario: { id: ACTOR, nombre_completo: 'Actor' } };
    await crearInvitacion(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'proyecto_usuarios', registroId: PROYECTO, campoModificado: 'miembro',
      valorNuevo: { id_usuario: OBJETIVO, rol: 'captura' }, operacion: 'INSERT', idUsuario: ACTOR
    });
  });
});

describe('transferirAdministracionProyecto', () => {
  test('audita UPDATE con administradores anteriores y el nuevo', async () => {
    miembrosQueries.transferirAdministracion.mockResolvedValue({
      administradoresAnteriores: [ACTOR], nombreNuevoAdministrador: 'Destino',
    });

    const req = { params: { id: PROYECTO }, body: { id_usuario: OBJETIVO }, usuario: { id: ACTOR, nombre_completo: 'Super' } };
    await transferirAdministracionProyecto(req, crearRes(), jest.fn());

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'proyecto_usuarios', registroId: PROYECTO, campoModificado: 'administracion_proyecto',
      valorAnterior: { administradores_anteriores: [ACTOR] },
      valorNuevo: { nuevo_administrador: OBJETIVO },
      operacion: 'UPDATE', idUsuario: ACTOR
    });
  });
});
