/**
 * ARCHIVO: actividades-sin-fecha.test.js
 * PROPÓSITO: Bloque 3.2 (navegación del árbol) — GET
 *            /proyectos/:id/actividades-sin-fecha. La consulta SQL en sí
 *            (los 3 UNION ALL con el criterio de "fecha efectiva" que ya
 *            usa el Cronograma) se validó aparte contra una instancia
 *            real de Postgres 16 con datos de prueba: una etapa sin
 *            fecha_fin, una acción sin fecha_inicio propia ni heredada,
 *            una acción que SÍ hereda fecha_inicio de una tarea (no debe
 *            contar), una subacción sin ninguna fecha, y una tarea sin
 *            fecha_limite — los 4 casos "sin fecha" aparecieron y el que
 *            hereda correctamente no apareció. Este test (pool mockeado,
 *            como el resto de la suite) cubre que el controller devuelve
 *            el total y los items tal cual los entrega la consulta.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/pool', () => ({ query: jest.fn() }));

const pool = require('../db/pool');
const { obtenerActividadesSinFecha } = require('../controllers/proyectos.stats.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /proyectos/:id/actividades-sin-fecha', () => {
  it('devuelve total e items tal cual los entrega la consulta', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 'e2', nombre: 'Etapa sin fecha fin', tipo: 'etapa', contexto: null },
        { id: 'a2', nombre: 'Accion sin fecha inicio ni tareas', tipo: 'accion', contexto: 'Etapa con fechas' },
      ],
    });
    const req = { params: { id: 'proyecto-1' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerActividadesSinFecha(req, res, next);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['proyecto-1']);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      datos: {
        total: 2,
        items: [
          { id: 'e2', nombre: 'Etapa sin fecha fin', tipo: 'etapa', contexto: null },
          { id: 'a2', nombre: 'Accion sin fecha inicio ni tareas', tipo: 'accion', contexto: 'Etapa con fechas' },
        ],
      },
      mensaje: 'Actividades sin fecha obtenidas',
    });
  });

  it('con un proyecto sin huecos, devuelve total 0 y items vacío', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'proyecto-2' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerActividadesSinFecha(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      datos: { total: 0, items: [] },
      mensaje: 'Actividades sin fecha obtenidas',
    });
  });
});
