/**
 * ARCHIVO: estado-controller-permisos.test.js
 * PROPÓSITO: Hueco 4.1 de la Fase 1 del modelo de permisos
 *            (docs/modelo-permisos.md) — PUT /estado y /estado/automatico
 *            no tenían NINGÚN chequeo: el objetivo viaja en el cuerpo
 *            (entidad_tipo/entidad_id), así que ninguna ruta dedicada lo
 *            protegía. Ahora exigen el mismo peldaño que exigiría la ruta
 *            dedicada de esa entidad.
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../utils/validaciones-estado', () => ({
  cambiarEstado: jest.fn(),
  contarDescendientes: jest.fn(),
  verificarAutoCompletarPadre: jest.fn(),
  restaurarEstadoAutomatico: jest.fn(),
}));
jest.mock('../utils/recalculos', () => ({ recalcularEtapa: jest.fn(), recalcularProyecto: jest.fn() }));
jest.mock('../db/queries/aportaciones.queries', () => ({ procesarCambioNodo: jest.fn() }));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));
jest.mock('../utils/avance-semaforo', () => ({ obtenerProyectoId: jest.fn(), recalcularPadres: jest.fn() }));
const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ nombre: 'x' }] }), release: jest.fn() };
jest.mock('../db/pool', () => ({ connect: jest.fn(() => Promise.resolve(mockClient)) }));
jest.mock('../utils/autorizacion', () => ({
  tienePeldanoProyecto: jest.fn(),
  tienePeldanoNodo: jest.fn(),
}));

const { tienePeldanoProyecto, tienePeldanoNodo } = require('../utils/autorizacion');
const { cambiarEstado: cambiarEstadoUtil } = require('../utils/validaciones-estado');
const estadoController = require('../controllers/estado.controller');

beforeEach(() => jest.clearAllMocks());

describe('PUT /estado — cambiarEstado', () => {
  test('entidad_tipo Proyecto exige administracion_proyecto, no solo captura', async () => {
    tienePeldanoProyecto.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, body: { entidad_tipo: 'Proyecto', entidad_id: UUID_1, estado: 'Completada' } };
    const res = crearRes();

    await estadoController.cambiarEstado(req, res);

    expect(tienePeldanoProyecto).toHaveBeenCalledWith(req.usuario, UUID_1, 'administracion_proyecto');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cambiarEstadoUtil).not.toHaveBeenCalled();
  });

  test('entidad_tipo Etapa exige captura en el nodo (mismo criterio que PUT /etapas/:id)', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, body: { entidad_tipo: 'Etapa', entidad_id: UUID_1, estado: 'Completada' } };
    const res = crearRes();

    await estadoController.cambiarEstado(req, res);

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, 'etapa', UUID_1, 'captura');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cambiarEstadoUtil).not.toHaveBeenCalled();
  });

  test('Subaccion se resuelve como tipo de nodo "accion" (misma tabla)', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(true);
    cambiarEstadoUtil.mockResolvedValueOnce({ estadoAnterior: 'Pendiente', estadoNuevo: 'Completada' });
    const req = { usuario: { id: UUID_1 }, body: { entidad_tipo: 'Subaccion', entidad_id: UUID_1, estado: 'Completada' } };
    const res = crearRes();

    await estadoController.cambiarEstado(req, res);

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, 'accion', UUID_1, 'captura');
  });

  test('con permiso, procede con el cambio de estado normalmente', async () => {
    tienePeldanoProyecto.mockResolvedValueOnce(true);
    cambiarEstadoUtil.mockResolvedValueOnce({ estadoAnterior: 'Pendiente', estadoNuevo: 'Completada' });
    const req = { usuario: { id: UUID_1 }, body: { entidad_tipo: 'Proyecto', entidad_id: UUID_1, estado: 'Completada' } };
    const res = crearRes();

    await estadoController.cambiarEstado(req, res);

    expect(cambiarEstadoUtil).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('PUT /estado/automatico — restaurarEstadoAutomatico', () => {
  test('sin permiso sobre el nodo, 403 y nunca llega a restaurarEstadoAutomaticoUtil', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, body: { entidad_tipo: 'Accion', entidad_id: UUID_1 } };
    const res = crearRes();

    await estadoController.restaurarEstadoAutomatico(req, res);

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, 'accion', UUID_1, 'captura');
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
