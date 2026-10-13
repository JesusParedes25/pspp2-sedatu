/**
 * ARCHIVO: ficha-vs-avance-permisos.test.js
 * PROPÓSITO: Punto 5 de la ronda de correcciones de la Fase 1
 *            (docs/modelo-permisos.md) — PATCH /etapas|acciones|tareas/:id
 *            mezclaba "registrar avance" (antes exigía solo 'captura' sin
 *            distinción) con "editar la ficha" (nombre, fechas, prioridad,
 *            instrumento...), que ahora exige 'responsable'. El mínimo se
 *            decide por los campos presentes en el payload, dentro del
 *            mismo manejador (minimoParaPatchNodo en utils/autorizacion.js),
 *            sin partir el endpoint en dos.
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

jest.mock('../utils/autorizacion', () => ({
  tienePeldanoNodo: jest.fn(),
  minimoParaPatchNodo: jest.requireActual('../utils/autorizacion').minimoParaPatchNodo,
  puedeGestionarNodo: jest.fn(),
}));
jest.mock('../db/pool', () => ({ connect: jest.fn() }));

const { tienePeldanoNodo } = require('../utils/autorizacion');
const pool = require('../db/pool');
const etapasController = require('../controllers/etapas.controller');
const accionesController = require('../controllers/acciones.controller');
const tareasController = require('../controllers/tareas.controller');

beforeEach(() => {
  jest.clearAllMocks();
  // Un cliente que nunca completa la transacción real (SELECT siempre
  // vacío → el controller corta en su propio 404 antes de tocar nada
  // más) — solo nos interesa confirmar que el gate de permiso deja pasar
  // o no ANTES de llegar aquí, sin que un rechazo a medio camino (p.ej.
  // en el ROLLBACK del catch) tumbe la prueba con un error no relacionado.
  pool.connect.mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  });
});

describe.each([
  ['etapa', 'etapas', (req, res, next) => etapasController.patchAvanceSemaforo(req, res, next)],
  ['accion', 'acciones', (req, res, next) => accionesController.patchAvanceSemaforo(req, res, next)],
  ['tarea', 'tareas', (req, res, next) => tareasController.patchAvanceSemaforo(req, res, next)],
])('PATCH /%s/:id — minimoParaPatchNodo (vía %s.controller.js)', (tipoNodo, _ruta, invocar) => {
  test('solo avance_actual + estatus_cualitativo: con "captura" basta', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { avance_actual: 40, estatus_cualitativo: 'En curso' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'captura');
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(pool.connect).toHaveBeenCalled();
  });

  test('solo avance_actual + estatus_cualitativo: con solo "lectura" (sin captura), 403 y nunca conecta a la BD', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { avance_actual: 40, estatus_cualitativo: 'En curso' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'captura');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('un campo de ficha (nombre) exige "responsable" — con solo "captura" no basta', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { nombre: 'Nuevo nombre' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'responsable');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('un campo de ficha (prioridad) con "responsable" sí se permite', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { prioridad: 'Alta' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'responsable');
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('avance_actual JUNTO con un campo de ficha (fecha_limite): exige "responsable", no basta "captura"', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(false);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { avance_actual: 60, fecha_limite: '2026-12-01' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'responsable');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('estado + motivo_bloqueo solos (sin ningún campo de ficha): basta "captura"', async () => {
    tienePeldanoNodo.mockResolvedValueOnce(true);
    const req = { usuario: { id: UUID_1 }, params: { id: UUID_1 }, body: { estado: 'Bloqueada', motivo_bloqueo: 'Depende de otra área' } };
    const res = crearRes();
    await invocar(req, res, jest.fn());

    expect(tienePeldanoNodo).toHaveBeenCalledWith(req.usuario, tipoNodo, UUID_1, 'captura');
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
