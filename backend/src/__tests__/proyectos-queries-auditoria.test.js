/**
 * ARCHIVO: proyectos-queries-auditoria.test.js
 * PROPÓSITO: Verifica que eliminar/restaurar/purgar un proyecto
 *            (backend/src/db/queries/proyectos.queries.js) queden
 *            registrados en la bitácora oficial `auditoria`, y que el
 *            purgado definitivo audite ANTES del DELETE que dispara la
 *            cascada (punto 3 del paso 6 DGTIC: trazabilidad).
 */

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockPoolQuery = jest.fn();
jest.mock('../db/pool', () => ({
  connect: jest.fn(() => Promise.resolve(mockClient)),
  query: (...args) => mockPoolQuery(...args)
}));

const {
  eliminarProyecto, restaurarProyecto, purgarProyecto
} = require('../db/queries/proyectos.queries');

const UUID_P = '00000000-0000-0000-0000-000000000001';
const UUID_USR = '00000000-0000-0000-0000-00000000000a';

beforeEach(() => {
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockPoolQuery.mockReset();
});

function llamadasAuditoria() {
  return mockClient.query.mock.calls.filter(
    call => typeof call[0] === 'string' && call[0].includes('INSERT INTO auditoria')
  );
}

describe('eliminarProyecto (soft delete)', () => {
  test('audita deleted_at y hace commit cuando el proyecto existe', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: UUID_P, nombre: 'Proyecto X' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'aud-1' }] }) // INSERT auditoria
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await eliminarProyecto(UUID_P, UUID_USR);

    expect(resultado).toEqual({ id: UUID_P, nombre: 'Proyecto X' });
    const audit = llamadasAuditoria();
    expect(audit).toHaveLength(1);
    expect(audit[0][1]).toEqual(
      expect.arrayContaining(['proyectos', UUID_P, 'deleted_at', null, 'eliminado (papelera)', 'UPDATE', UUID_USR])
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('no audita ni falla si el proyecto no existe/ya estaba eliminado', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE: 0 filas
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await eliminarProyecto(UUID_P, UUID_USR);

    expect(resultado).toBeNull();
    expect(llamadasAuditoria()).toHaveLength(0);
  });

  test('hace rollback si falla a medio camino', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('boom'));

    await expect(eliminarProyecto(UUID_P, UUID_USR)).rejects.toThrow('boom');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('restaurarProyecto', () => {
  test('audita deleted_at -> null cuando el proyecto estaba en la papelera', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: UUID_P, nombre: 'Proyecto X' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'aud-2' }] }) // INSERT auditoria
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await restaurarProyecto(UUID_P, UUID_USR);

    expect(resultado).toEqual({ id: UUID_P, nombre: 'Proyecto X' });
    const audit = llamadasAuditoria();
    expect(audit).toHaveLength(1);
    expect(audit[0][1]).toEqual(
      expect.arrayContaining(['proyectos', UUID_P, 'deleted_at', 'eliminado (papelera)', null, 'UPDATE', UUID_USR])
    );
  });
});

describe('purgarProyecto (borrado definitivo)', () => {
  test('audita (DELETE, fotografía completa) ANTES del DELETE que dispara la cascada', async () => {
    const filaCompleta = { id: UUID_P, nombre: 'Proyecto X', deleted_at: '2026-01-01' };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [filaCompleta] }) // SELECT snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'aud-3' }] }) // INSERT auditoria
      .mockResolvedValueOnce({ rows: [{ id: UUID_P, nombre: 'Proyecto X' }] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await purgarProyecto(UUID_P, UUID_USR);

    expect(resultado).toEqual({ id: UUID_P, nombre: 'Proyecto X' });

    const llamadas = mockClient.query.mock.calls;
    const idxAudit = llamadas.findIndex(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO auditoria'));
    const idxDelete = llamadas.findIndex(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM proyectos'));
    expect(idxAudit).toBeGreaterThan(-1);
    expect(idxDelete).toBeGreaterThan(-1);
    expect(idxAudit).toBeLessThan(idxDelete); // auditoria antes de la cascada

    const audit = llamadasAuditoria()[0];
    expect(audit[1][0]).toBe('proyectos');
    expect(audit[1][1]).toBe(UUID_P);
    expect(audit[1][2]).toBe('fila');
    expect(audit[1][3]).toBe(JSON.stringify(filaCompleta)); // valor_anterior: snapshot completo
    expect(audit[1][5]).toBe('DELETE');
    expect(audit[1][6]).toBe(UUID_USR);
  });

  test('no audita ni borra si el proyecto no está en la papelera', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT: no existe / no está en papelera
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const resultado = await purgarProyecto(UUID_P, UUID_USR);

    expect(resultado).toBeNull();
    expect(llamadasAuditoria()).toHaveLength(0);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    const llamoDelete = mockClient.query.mock.calls.some(
      c => typeof c[0] === 'string' && c[0].includes('DELETE FROM proyectos')
    );
    expect(llamoDelete).toBe(false);
  });
});
