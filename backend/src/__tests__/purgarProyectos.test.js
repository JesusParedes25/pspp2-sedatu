/**
 * ARCHIVO: purgarProyectos.test.js
 * PROPÓSITO: Verifica que la purga automática (30 días en papelera,
 *            backend/src/utils/purgarProyectos.js) audite cada proyecto en
 *            la bitácora oficial ANTES del DELETE que dispara la cascada,
 *            con idUsuario=null (acción del propio sistema).
 */

const mockClient = { query: jest.fn(), release: jest.fn() };
jest.mock('../db/pool', () => ({
  connect: jest.fn(() => Promise.resolve(mockClient))
}));

const { purgarProyectosVencidos } = require('../utils/purgarProyectos');

beforeEach(() => {
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

describe('purgarProyectosVencidos', () => {
  test('audita cada proyecto vencido (DELETE, idUsuario null) antes del DELETE masivo', async () => {
    const p1 = { id: 'p1', nombre: 'Proyecto 1', deleted_at: '2025-01-01' };
    const p2 = { id: 'p2', nombre: 'Proyecto 2', deleted_at: '2025-01-02' };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [p1, p2] }) // SELECT vencidos
      .mockResolvedValueOnce({ rows: [{ id: 'aud-1' }] }) // INSERT auditoria p1
      .mockResolvedValueOnce({ rows: [{ id: 'aud-2' }] }) // INSERT auditoria p2
      .mockResolvedValueOnce({ rows: [{ id: 'p1', nombre: 'Proyecto 1' }, { id: 'p2', nombre: 'Proyecto 2' }] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await purgarProyectosVencidos();

    expect(resultado).toHaveLength(2);

    const llamadas = mockClient.query.mock.calls;
    const auditCalls = llamadas.filter(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO auditoria'));
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0][1]).toEqual(
      expect.arrayContaining(['proyectos', 'p1', 'fila', JSON.stringify(p1), 'DELETE', null])
    );
    expect(auditCalls[1][1]).toEqual(
      expect.arrayContaining(['proyectos', 'p2', 'fila', JSON.stringify(p2), 'DELETE', null])
    );

    const idxUltimaAuditoria = llamadas.findIndex(c => c === auditCalls[1]);
    const idxDelete = llamadas.findIndex(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM proyectos'));
    expect(idxUltimaAuditoria).toBeLessThan(idxDelete);
  });

  test('sin proyectos vencidos: no audita, no borra, hace commit', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT: ninguno vencido
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const resultado = await purgarProyectosVencidos();

    expect(resultado).toEqual([]);
    const llamoAuditoria = mockClient.query.mock.calls.some(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO auditoria')
    );
    expect(llamoAuditoria).toBe(false);
  });

  test('si falla, hace rollback y devuelve []', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('db caída'));

    const resultado = await purgarProyectosVencidos();

    expect(resultado).toEqual([]);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
