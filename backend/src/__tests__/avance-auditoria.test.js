/**
 * ARCHIVO: avance-auditoria.test.js
 * PROPÓSITO: Verifica que un cambio de avance_actual en una etapa/acción/
 *            tarea hoja (PATCH .../:id, patchAvanceSemaforo) quede
 *            registrado en la bitácora oficial `auditoria` con el valor
 *            anterior y el nuevo — punto 2 del paso 6 DGTIC (trazabilidad):
 *            antes solo se registraba en `actividad` (solo el valor nuevo).
 *            No debe auditarse cuando el avance no cambia de verdad
 *            (ignorado por estado Completada/Pendiente/Cancelada, o
 *            cuando avance_actual no viene en el payload).
 */

const ETAPA_ID = '00000000-0000-0000-0000-000000000001';
const ACCION_ID = '00000000-0000-0000-0000-000000000002';
const TAREA_ID = '00000000-0000-0000-0000-000000000003';
const USR_ID = '00000000-0000-0000-0000-00000000000a';

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function dispatchQuery(filaBase) {
  return (sqlRaw) => {
    const s = sqlRaw.replace(/\s+/g, ' ').trim();
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return Promise.resolve({ rows: [] });
    if (s.startsWith('SELECT * FROM etapas WHERE id')) return Promise.resolve({ rows: [filaBase] });
    if (s.startsWith('SELECT * FROM acciones WHERE id')) return Promise.resolve({ rows: [filaBase] });
    if (s.startsWith('SELECT * FROM tareas WHERE id')) return Promise.resolve({ rows: [filaBase] });
    if (s.startsWith('UPDATE etapas SET')) return Promise.resolve({ rows: [] });
    if (s.startsWith('UPDATE acciones SET')) return Promise.resolve({ rows: [] });
    if (s.startsWith('UPDATE tareas SET')) return Promise.resolve({ rows: [filaBase] });
    if (s.startsWith('SELECT id_etapa, id_proyecto FROM acciones')) return Promise.resolve({ rows: [{ id_etapa: null, id_proyecto: null }] });
    throw new Error('Query no mockeada en este test: ' + s);
  };
}

jest.mock('../utils/autorizacion', () => ({
  tienePeldanoNodo: jest.fn().mockResolvedValue(true),
  minimoParaPatchNodo: jest.requireActual('../utils/autorizacion').minimoParaPatchNodo,
  puedeGestionarNodo: jest.fn(),
}));
jest.mock('../utils/avance-semaforo', () => ({
  esEtapaHoja: jest.fn().mockResolvedValue(true),
  esNodoHoja: jest.fn().mockResolvedValue(true),
  calcularAvanceEfectivo: jest.fn().mockResolvedValue(70),
  recalcularPadres: jest.fn().mockResolvedValue(undefined),
  obtenerSubarbol: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/recalculos', () => ({
  recalcularProyecto: jest.fn().mockResolvedValue(undefined),
  recalcularEtapa: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/validaciones-estado', () => ({
  cambiarEstado: jest.fn().mockResolvedValue({ estadoAnterior: 'En_proceso', estadoNuevo: 'Completada', auditoria_id: 'x' }),
  tipoRealAccion: jest.fn().mockReturnValue('Accion'),
  verificarAutoCompletarPadre: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../db/queries/aportaciones.queries', () => ({ procesarCambioNodo: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../db/queries/actividad.queries', () => ({ crearActividad: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../db/queries/municipios-nodo.queries', () => ({
  reemplazarMunicipiosEtapa: jest.fn(), obtenerMunicipiosEtapa: jest.fn().mockResolvedValue([]),
  reemplazarMunicipiosAccion: jest.fn(), obtenerMunicipiosAccion: jest.fn().mockResolvedValue([]),
  reemplazarMunicipiosTarea: jest.fn(), obtenerMunicipiosTarea: jest.fn().mockResolvedValue([]),
}));
jest.mock('../db/queries/cobertura-sync.queries', () => ({ sincronizarCobertura: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../db/queries/acciones.queries', () => ({ obtenerAccionPorId: jest.fn().mockResolvedValue({}) }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

describe('PATCH etapas/:id — auditoría de avance_actual', () => {
  test('cambia avance_actual: registra UPDATE con anterior/nuevo', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ETAPA_ID, avance_actual: 40, estado: 'En_proceso', id_proyecto: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/etapas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ETAPA_ID }, body: { avance_actual: 70 } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith({
      tabla: 'etapas', registroId: ETAPA_ID, campoModificado: 'avance_actual',
      valorAnterior: 40, valorNuevo: 70, idUsuario: USR_ID, client: expect.anything()
    });
  });

  test('avance_actual=null: audita anterior -> null', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ETAPA_ID, avance_actual: 55, estado: 'En_proceso', id_proyecto: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/etapas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ETAPA_ID }, body: { avance_actual: null } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      campoModificado: 'avance_actual', valorAnterior: 55, valorNuevo: null
    }));
  });

  test('avance_actual ignorado (nodo ya Completada): NO audita', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ETAPA_ID, avance_actual: 100, estado: 'Completada', id_proyecto: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/etapas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ETAPA_ID }, body: { avance_actual: 80 } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).not.toHaveBeenCalled();
  });

  test('sin avance_actual en el body: NO audita', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ETAPA_ID, avance_actual: 40, estado: 'En_proceso', id_proyecto: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/etapas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ETAPA_ID }, body: { prioridad: 'Alta' } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).not.toHaveBeenCalled();
  });
});

describe('PATCH acciones/:id — auditoría de avance_actual', () => {
  test('cambia avance_actual: registra UPDATE con anterior/nuevo', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ACCION_ID, avance_actual: 20, estado: 'En_proceso', id_etapa: null, id_proyecto: null, cve_ent: null, id_zm: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/acciones.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ACCION_ID }, body: { avance_actual: 60 } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith({
      tabla: 'acciones', registroId: ACCION_ID, campoModificado: 'avance_actual',
      valorAnterior: 20, valorNuevo: 60, idUsuario: USR_ID, client: expect.anything()
    });
  });

  test('avance_actual ignorado (nodo ya Pendiente): NO audita', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: ACCION_ID, avance_actual: 0, estado: 'Pendiente', id_etapa: null, id_proyecto: null, cve_ent: null, id_zm: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/acciones.controller');

    const req = { usuario: { id: USR_ID }, params: { id: ACCION_ID }, body: { avance_actual: 30 } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).not.toHaveBeenCalled();
  });
});

describe('PATCH tareas/:id — auditoría de avance_actual', () => {
  test('cambia avance_actual: registra UPDATE con anterior/nuevo', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: TAREA_ID, avance_actual: 10, estado: 'En_proceso', id_accion: ACCION_ID, cve_ent: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/tareas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: TAREA_ID }, body: { avance_actual: 50 } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith({
      tabla: 'tareas', registroId: TAREA_ID, campoModificado: 'avance_actual',
      valorAnterior: 10, valorNuevo: 50, idUsuario: USR_ID, client: expect.anything()
    });
  });

  test('avance_actual=null: audita anterior -> null', async () => {
    const mockClientQuery = jest.fn(dispatchQuery({ id: TAREA_ID, avance_actual: 33, estado: 'En_proceso', id_accion: ACCION_ID, cve_ent: null }));
    jest.doMock('../db/pool', () => ({ connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }) }));
    jest.resetModules();
    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/tareas.controller');

    const req = { usuario: { id: USR_ID }, params: { id: TAREA_ID }, body: { avance_actual: null } };
    const res = crearRes();
    await controller.patchAvanceSemaforo(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      campoModificado: 'avance_actual', valorAnterior: 33, valorNuevo: null
    }));
  });
});
