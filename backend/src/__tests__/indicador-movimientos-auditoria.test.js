/**
 * ARCHIVO: indicador-movimientos-auditoria.test.js
 * PROPÓSITO: Verifica que capturar o anular un movimiento de indicador
 *            (backend/src/db/queries/indicador-movimientos.queries.js) —
 *            tanto a mano (indicador-movimientos.controller.js) como
 *            automático desde un cambio de avance (aportaciones.queries.js
 *            ::procesarCambioNodo, mismo `crear()`) — quede registrado en
 *            la bitácora oficial `auditoria`. Punto 2 del paso 6 DGTIC.
 */

const mockPoolQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockPoolQuery(...args) }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const { registrarAuditoria } = require('../utils/auditoria');
const movimientosQueries = require('../db/queries/indicador-movimientos.queries');

const INDICADOR_ID = '00000000-0000-0000-0000-000000000001';
const MOV_ID = '00000000-0000-0000-0000-000000000002';
const USR_ID = '00000000-0000-0000-0000-00000000000a';

beforeEach(() => {
  mockPoolQuery.mockReset();
  registrarAuditoria.mockClear();
});

describe('crear (captura manual o automática)', () => {
  test('cantidad 0: no inserta ni audita', async () => {
    const resultado = await movimientosQueries.crear({ idIndicador: INDICADOR_ID, cantidad: 0, fecha: '2026-01-01', origen: 'manual', creadoPor: USR_ID });
    expect(resultado).toBeNull();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test('inserta un movimiento nuevo: audita INSERT con la fila completa', async () => {
    const movimiento = { id: MOV_ID, id_indicador: INDICADOR_ID, cantidad: 50, fecha: '2026-01-01' };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [movimiento] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ total: '50' }] }) // recalcularValorActual: SELECT SUM
      .mockResolvedValueOnce({ rows: [] }); // recalcularValorActual: UPDATE indicadores

    await movimientosQueries.crear({ idIndicador: INDICADOR_ID, cantidad: 50, fecha: '2026-01-01', origen: 'manual', creadoPor: USR_ID });

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_movimientos', registroId: MOV_ID, campoModificado: 'fila',
      valorNuevo: movimiento, operacion: 'INSERT', idUsuario: USR_ID, client: expect.anything()
    });
  });

  test('colapsa en el mismo día (modo proporcional): audita UPDATE de cantidad', async () => {
    const existente = { id: MOV_ID, cantidad: 30 };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [existente] }) // SELECT existente
      .mockResolvedValueOnce({ rows: [{ id: MOV_ID, cantidad: 50 }] }) // UPDATE ... RETURNING *
      .mockResolvedValueOnce({ rows: [{ total: '50' }] }) // recalcularValorActual: SELECT SUM
      .mockResolvedValueOnce({ rows: [] }); // recalcularValorActual: UPDATE indicadores

    await movimientosQueries.crear({
      idIndicador: INDICADOR_ID, cantidad: 20, fecha: '2026-01-01', origen: 'actividad',
      idNodoOrigen: 'nodo-1', creadoPor: USR_ID, colapsarMismoDia: true
    });

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_movimientos', registroId: MOV_ID, campoModificado: 'cantidad',
      valorAnterior: 30, valorNuevo: 50, operacion: 'UPDATE', idUsuario: USR_ID, client: expect.anything()
    });
  });
});

describe('anular', () => {
  test('audita UPDATE de anulado_en', async () => {
    const movimiento = { id: MOV_ID, id_indicador: INDICADOR_ID, anulado_en: '2026-02-01T00:00:00Z' };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [movimiento] }) // UPDATE ... RETURNING *
      .mockResolvedValueOnce({ rows: [{ total: '0' }] }) // recalcularValorActual: SELECT SUM
      .mockResolvedValueOnce({ rows: [] }); // recalcularValorActual: UPDATE indicadores

    await movimientosQueries.anular(MOV_ID, { motivo: 'Error de captura', usuarioId: USR_ID });

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicador_movimientos', registroId: MOV_ID, campoModificado: 'anulado_en',
      valorAnterior: null, valorNuevo: movimiento.anulado_en,
      operacion: 'UPDATE', idUsuario: USR_ID, client: expect.anything()
    });
  });

  test('movimiento ya anulado/inexistente: no audita', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const resultado = await movimientosQueries.anular(MOV_ID, { motivo: 'x', usuarioId: USR_ID });
    expect(resultado).toBeNull();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});
