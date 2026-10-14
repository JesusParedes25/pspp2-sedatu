/**
 * ARCHIVO: paso2-interseccion-id-dg.test.js
 * PROPÓSITO: Fase 2, Paso 2 (docs/modelo-permisos.md sección 9) — el
 *            ?id_dg= libre de dashboard.queries.js y geografia.queries.js
 *            (obtenerResumenPorEstados/obtenerResumenTerritorial) debe
 *            intersectarse con el alcance real del usuario, nunca
 *            obedecerse a ciegas: una DG ajena al alcance del usuario no
 *            amplía nada, porque ambas condiciones se combinan con AND
 *            en la misma consulta. No se mockean las queries mismas —
 *            solo ../db/pool — para que la prueba sea sobre el SQL real.
 *
 * Ejecutar: npm test
 */

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const dashboardQueries = require('../db/queries/dashboard.queries');
const geografiaQueries = require('../db/queries/geografia.queries');

beforeEach(() => jest.clearAllMocks());

describe('dashboard.queries.js — intersección estricta', () => {
  test('obtenerMetricasGlobales combina alcance e id_dg con AND, nunca OR', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{}] });
    await dashboardQueries.obtenerMetricasGlobales({ id_dg: 'dg-ajena' }, ['p1', 'p2']);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.id = ANY\(\$1\)/);
    expect(sql).toMatch(/AND[^;]*p\.id_dg_lider = \$2/);
    expect(params).toEqual([['p1', 'p2'], 'dg-ajena']);
  });

  test('obtenerAvancePorDG ahora SÍ recibe y aplica el alcance (antes no recibía ningún filtro)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await dashboardQueries.obtenerAvancePorDG({}, ['p1']);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.id = ANY\(\$1\)/);
    expect(params).toEqual([['p1']]);
  });

  test('obtenerAlertas aplica el mismo filtro a las dos subconsultas (vencidas y riesgos)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await dashboardQueries.obtenerAlertas({ id_dg: 'dg-ajena' }, ['p1']);

    expect(pool.query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toMatch(/p\.id = ANY\(\$1\)/);
      expect(sql).toMatch(/AND[^;]*p\.id_dg_lider = \$2/);
      expect(params).toEqual([['p1'], 'dg-ajena']);
    }
  });

  test('sin alcance (null, superadmin/ejecutivo) e id_dg presente, solo se aplica id_dg', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{}] });
    await dashboardQueries.obtenerMetricasGlobales({ id_dg: 'dg-x' }, null);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/p\.id = ANY/);
    expect(sql).toMatch(/p\.id_dg_lider = \$1/);
    expect(params).toEqual(['dg-x']);
  });
});

describe('geografia.queries.js — intersección estricta (mapas)', () => {
  test('obtenerResumenPorEstados combina alcance e id_dg con AND', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await geografiaQueries.obtenerResumenPorEstados({ id_dg: 'dg-ajena' }, ['p1', 'p2']);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.id = ANY\(\$1\)/);
    expect(sql).toMatch(/AND[^;]*p\.id_dg_lider = \$2/);
    expect(params).toEqual([['p1', 'p2'], 'dg-ajena']);
  });

  test('obtenerResumenTerritorial combina alcance e id_dg con AND en la consulta base de acciones', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // acciones
      .mockResolvedValueOnce({ rows: [] }) // riesgos (no se llega, proyectoIds vacío)
      .mockResolvedValueOnce({ rows: [] }); // indicadores
    await geografiaQueries.obtenerResumenTerritorial('edomex', { id_dg: 'dg-ajena' }, ['p1', 'p2']);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/p\.id = ANY\(\$2\)/);
    expect(sql).toMatch(/AND[^;]*p\.id_dg_lider = \$3/);
    expect(params).toEqual(['edomex', ['p1', 'p2'], 'dg-ajena']);
  });
});
