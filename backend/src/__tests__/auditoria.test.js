/**
 * ARCHIVO: auditoria.test.js
 * PROPÓSITO: Tests de la bitácora OFICIAL de auditoría (backend/src/utils/auditoria.js).
 *
 * Ejecutar: npm test
 */

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args) => mockQuery(...args)
}));

const { registrarAuditoria } = require('../utils/auditoria');

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_USR = '00000000-0000-0000-0000-00000000000a';
const UUID_AUD = '00000000-0000-0000-0000-00000000000b';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('registrarAuditoria', () => {
  test('inserta con operación UPDATE por omisión y campo_modificado real (no fijo a "estado")', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_AUD }] });
    const id = await registrarAuditoria({
      tabla: 'etapas', registroId: UUID_1, campoModificado: 'avance_actual',
      valorAnterior: 40, valorNuevo: 100, idUsuario: UUID_USR
    });
    expect(id).toBe(UUID_AUD);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auditoria'),
      ['etapas', UUID_1, 'avance_actual', '40', '100', 'UPDATE', UUID_USR, null]
    );
  });

  test('INSERT: valor_anterior null, serializa un objeto como JSON', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_AUD }] });
    await registrarAuditoria({
      tabla: 'indicadores', registroId: UUID_1, campoModificado: 'fila',
      valorNuevo: { nombre: 'Indicador X', meta_global: 10 },
      operacion: 'INSERT', idUsuario: UUID_USR
    });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[3]).toBeNull(); // valor_anterior
    expect(params[4]).toBe(JSON.stringify({ nombre: 'Indicador X', meta_global: 10 }));
    expect(params[5]).toBe('INSERT');
  });

  test('DELETE: valor_nuevo null, conserva id_evento_origen', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_AUD }] });
    await registrarAuditoria({
      tabla: 'proyectos', registroId: UUID_1, campoModificado: 'fila',
      valorAnterior: { nombre: 'Proyecto Y' }, operacion: 'DELETE',
      idUsuario: UUID_USR, idEventoOrigen: 'origen-uuid'
    });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[4]).toBeNull(); // valor_nuevo
    expect(params[5]).toBe('DELETE');
    expect(params[7]).toBe('origen-uuid');
  });

  test('usa el client de transacción cuando se provee, no el pool compartido', async () => {
    const clientQuery = jest.fn().mockResolvedValueOnce({ rows: [{ id: UUID_AUD }] });
    const client = { query: clientQuery };
    await registrarAuditoria({
      tabla: 'etapas', registroId: UUID_1, campoModificado: 'avance_actual',
      valorAnterior: 0, valorNuevo: 50, idUsuario: UUID_USR, client
    });
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('exige tabla, registroId y campoModificado', async () => {
    await expect(registrarAuditoria({
      registroId: UUID_1, campoModificado: 'x', idUsuario: UUID_USR
    })).rejects.toThrow(/obligatorios/);
    await expect(registrarAuditoria({
      tabla: 'etapas', campoModificado: 'x', idUsuario: UUID_USR
    })).rejects.toThrow(/obligatorios/);
    await expect(registrarAuditoria({
      tabla: 'etapas', registroId: UUID_1, idUsuario: UUID_USR
    })).rejects.toThrow(/obligatorios/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('idUsuario es obligatorio salvo que se pase null explícito (acción del sistema)', async () => {
    await expect(registrarAuditoria({
      tabla: 'etapas', registroId: UUID_1, campoModificado: 'x'
    })).rejects.toThrow(/idUsuario es obligatorio/);
    expect(mockQuery).not.toHaveBeenCalled();

    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_AUD }] });
    await registrarAuditoria({
      tabla: 'proyectos', registroId: UUID_1, campoModificado: 'fila',
      valorAnterior: { nombre: 'X' }, operacion: 'DELETE', idUsuario: null
    });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[6]).toBeNull(); // id_usuario
  });

  test('rechaza una operación fuera de INSERT/UPDATE/DELETE', async () => {
    await expect(registrarAuditoria({
      tabla: 'etapas', registroId: UUID_1, campoModificado: 'x',
      idUsuario: UUID_USR, operacion: 'SELECT'
    })).rejects.toThrow(/operación no válida/);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
