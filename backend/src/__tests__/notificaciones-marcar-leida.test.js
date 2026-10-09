/**
 * ARCHIVO: notificaciones-marcar-leida.test.js
 * PROPÓSITO: marcarLeida validaba solo por id, sin comprobar que la
 *            notificación fuera del usuario que la marca (docs/modelo-permisos.md,
 *            sección 6.2) — hueco cerrado en la Fase 1 del modelo de permisos.
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_2 = '00000000-0000-0000-0000-000000000002';

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockQuery(...args) }));

const { marcarLeida } = require('../db/queries/notificaciones.queries');

beforeEach(() => mockQuery.mockReset());

test('el UPDATE filtra por id Y por id_usuario, no solo por id', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_1 }] });
  await marcarLeida(UUID_1, UUID_2);
  const [sql, params] = mockQuery.mock.calls[0];
  expect(sql).toMatch(/AND id_usuario = \$2/);
  expect(params).toEqual([UUID_1, UUID_2]);
});

test('si la notificación es de otro usuario, el UPDATE no afecta ninguna fila', async () => {
  // Simula lo que haría Postgres: WHERE id=$1 AND id_usuario=$2 sin match -> sin filas.
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const resultado = await marcarLeida(UUID_1, UUID_2);
  expect(resultado).toBeNull();
});
