/**
 * ARCHIVO: indicadores-auditoria.test.js
 * PROPÓSITO: Verifica que crear/actualizar/eliminar un indicador
 *            (backend/src/db/queries/indicadores.queries.js y el borrado
 *            duro en backend/src/controllers/indicadores.controller.js)
 *            queden registrados en la bitácora oficial `auditoria` —
 *            punto 2 del paso 6 DGTIC: antes ninguna de estas operaciones
 *            tocaba `auditoria` (crear no se registraba en ningún lado;
 *            actualizar/eliminar solo con título genérico en actividad_log).
 */

const mockPoolQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockPoolQuery(...args) }));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));

const { registrarAuditoria } = require('../utils/auditoria');
const indicadoresQueries = require('../db/queries/indicadores.queries');

const PROYECTO_ID = '00000000-0000-0000-0000-0000000000f1';
const INDICADOR_ID = '00000000-0000-0000-0000-000000000001';
const USR_ID = '00000000-0000-0000-0000-00000000000a';

beforeEach(() => {
  mockPoolQuery.mockReset();
  registrarAuditoria.mockClear();
});

describe('indicadoresQueries.crear', () => {
  test('audita INSERT con la fila creada', async () => {
    const filaCreada = { id: INDICADOR_ID, id_proyecto: PROYECTO_ID, nombre: 'Avance físico' };
    mockPoolQuery.mockResolvedValueOnce({ rows: [filaCreada] }); // INSERT INTO indicadores

    await indicadoresQueries.crear(PROYECTO_ID, { nombre: 'Avance físico', tipo: 'Numero', unidad: 'Unidades' }, null, USR_ID);

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicadores', registroId: INDICADOR_ID, campoModificado: 'fila',
      valorNuevo: filaCreada, operacion: 'INSERT', idUsuario: USR_ID, client: undefined
    });
  });
});

describe('indicadoresQueries.actualizar', () => {
  test('audita UPDATE con ficha anterior y nueva', async () => {
    const antes = { nombre: 'Viejo', tipo: 'Numero', unidad: 'Unidades', unidad_personalizada: null, etiqueta_unidad: null, meta_global: 100, descripcion: null };
    const despues = { id: INDICADOR_ID, id_proyecto: PROYECTO_ID, nombre: 'Nuevo', tipo: 'Numero', unidad: 'Unidades', unidad_personalizada: null, etiqueta_unidad: null, meta_global: 200, descripcion: null };
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [antes] }) // SELECT ficha antes del UPDATE
      .mockResolvedValueOnce({ rows: [despues] }); // UPDATE ... RETURNING *

    await indicadoresQueries.actualizar(INDICADOR_ID, { nombre: 'Nuevo', tipo: 'Numero', unidad: 'Unidades', meta_global: 200 }, USR_ID);

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicadores', registroId: INDICADOR_ID, campoModificado: 'ficha',
      valorAnterior: antes,
      valorNuevo: { nombre: 'Nuevo', tipo: 'Numero', unidad: 'Unidades', unidad_personalizada: null, etiqueta_unidad: null, meta_global: 200, descripcion: null },
      operacion: 'UPDATE', idUsuario: USR_ID
    });
  });

  test('indicador inexistente: no audita', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT ficha antes: no existe
      .mockResolvedValueOnce({ rows: [] }); // UPDATE: 0 filas

    const resultado = await indicadoresQueries.actualizar(INDICADOR_ID, { nombre: 'X', tipo: 'Numero', unidad: 'Unidades' }, USR_ID);

    expect(resultado).toBeNull();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('indicadoresQueries.eliminar (soft)', () => {
  test('audita UPDATE activo true -> false', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: INDICADOR_ID, id_proyecto: PROYECTO_ID, nombre: 'X' }] });

    await indicadoresQueries.eliminar(INDICADOR_ID, USR_ID);

    expect(registrarAuditoria).toHaveBeenCalledWith({
      tabla: 'indicadores', registroId: INDICADOR_ID, campoModificado: 'activo',
      valorAnterior: true, valorNuevo: false, operacion: 'UPDATE', idUsuario: USR_ID
    });
  });
});

describe('indicadores.controller.js::eliminar — borrado duro', () => {
  test('audita DELETE con la fila completa ANTES de la cascada', async () => {
    jest.resetModules();
    const mockQuery = jest.fn();
    jest.doMock('../db/pool', () => ({ query: (...args) => mockQuery(...args) }));
    jest.doMock('../utils/auditoria', () => ({ registrarAuditoria: jest.fn().mockResolvedValue('aud-id') }));
    jest.doMock('../utils/actividad-log', () => ({ registrarActividad: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('../db/queries/indicadores.queries', () => ({}));
    jest.doMock('../db/queries/inicio.queries', () => ({}));
    jest.doMock('../db/queries/miembros.queries', () => ({}));
    jest.doMock('../utils/alcanceProyectos', () => ({ resolverProyectoIdsFiltro: jest.fn() }));

    const filaCompleta = { id: 'ind-1', id_proyecto: 'proy-1', nombre: 'Indicador con aportaciones' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: 2 }] }) // countAport
      .mockResolvedValueOnce({ rows: [{ n: 0 }] }) // countMetas
      .mockResolvedValueOnce({ rows: [{ n: 0 }] }) // countCategorias
      .mockResolvedValueOnce({ rows: [filaCompleta] }) // SELECT * previo
      .mockResolvedValueOnce({ rows: [{ id: 'ind-1' }] }); // DELETE ... RETURNING id

    const { registrarAuditoria: audit } = require('../utils/auditoria');
    const controller = require('../controllers/indicadores.controller');

    const req = { params: { id: 'ind-1' }, query: { confirmar: 'true' }, usuario: { id: 'usr-1' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.eliminar(req, res, jest.fn());

    expect(audit).toHaveBeenCalledWith({
      tabla: 'indicadores', registroId: 'ind-1', campoModificado: 'fila',
      valorAnterior: filaCompleta, operacion: 'DELETE', idUsuario: 'usr-1'
    });

    const llamadas = mockQuery.mock.calls;
    const idxDeleteCall = llamadas.findIndex(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM indicadores'));
    // La auditoría (mock aparte) se esperó (await) entre el SELECT previo
    // (llamada 3, 0-based) y el DELETE (llamada 4) — si no se esperara
    // antes, el DELETE habría corrido en otra posición de la secuencia.
    expect(idxDeleteCall).toBe(4);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Indicador eliminado' });
  });
});
