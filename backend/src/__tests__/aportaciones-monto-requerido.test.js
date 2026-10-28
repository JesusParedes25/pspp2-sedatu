/**
 * ARCHIVO: aportaciones-monto-requerido.test.js
 * PROPÓSITO: Bloque B1 reportado tras el PR #170 — un nodo vinculado con
 *            aportación 0 no mueve el indicador aunque se complete (el
 *            cálculo da objetivo=0, diff=0, no inserta movimiento). Antes
 *            existía un escape hatch (`permitir_cero`) para crearla así a
 *            propósito; se retira: toda vinculación nueva, y toda edición
 *            de una ya existente, exige una cantidad mayor que 0.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/queries/aportaciones.queries', () => ({
  crear: jest.fn(),
  actualizar: jest.fn(),
  procesarCambioNodo: jest.fn(),
  obtenerConNodo: jest.fn(),
}));
jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../utils/actividad-log', () => ({ registrarActividad: jest.fn() }));

const aportacionesQueries = require('../db/queries/aportaciones.queries');
const { crear, actualizar } = require('../controllers/aportaciones.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('POST /indicadores/:id/aportaciones', () => {
  it('rechaza con 400 un monto 0, aunque mande permitir_cero (retirado)', async () => {
    const req = {
      params: { id: 'ind-1' },
      body: { tipo_nodo: 'etapa', id_nodo: 'e-1', valor_aportacion: 0, permitir_cero: true, modo: 'al_concluir' },
      usuario: { id: 'u-1' },
    };
    const res = crearRes();
    const next = jest.fn();
    await crear(req, res, next);

    expect(aportacionesQueries.crear).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].codigo).toBe('MONTO_REQUERIDO');
  });

  it('rechaza un monto vacío o negativo', async () => {
    const res = crearRes();
    const next = jest.fn();
    await crear({ params: { id: 'ind-1' }, body: { tipo_nodo: 'etapa', id_nodo: 'e-1', valor_aportacion: '' }, usuario: {} }, res, next);
    expect(next.mock.calls[0][0].codigo).toBe('MONTO_REQUERIDO');

    await crear({ params: { id: 'ind-1' }, body: { tipo_nodo: 'etapa', id_nodo: 'e-1', valor_aportacion: -5 }, usuario: {} }, res, next);
    expect(next.mock.calls[1][0].codigo).toBe('MONTO_REQUERIDO');
  });

  it('acepta un monto positivo y procesa el nodo de inmediato', async () => {
    aportacionesQueries.crear.mockResolvedValue({ id: 'ap-1', id_indicador: 'ind-1' });
    aportacionesQueries.obtenerConNodo.mockResolvedValue({ id_etapa: 'e-1', nodo_nombre: 'Etapa 1' });
    const pool = require('../db/pool');
    pool.query.mockResolvedValue({ rows: [{ id_proyecto: 'p-1', nombre: 'Indicador 1' }] });

    const req = {
      params: { id: 'ind-1' },
      body: { tipo_nodo: 'etapa', id_nodo: 'e-1', valor_aportacion: 50, modo: 'al_concluir' },
      usuario: { id: 'u-1' },
    };
    const res = crearRes();
    await crear(req, res, jest.fn());

    expect(aportacionesQueries.crear).toHaveBeenCalledWith(expect.objectContaining({ aportacion: 50 }));
    expect(aportacionesQueries.procesarCambioNodo).toHaveBeenCalledWith('etapa', 'e-1', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('PATCH /aportaciones/:id', () => {
  it('rechaza bajar la cantidad a 0 al editar', async () => {
    const res = crearRes();
    const next = jest.fn();
    await actualizar({ params: { id: 'ap-1' }, body: { valor_aportacion: 0 }, usuario: {} }, res, next);

    expect(aportacionesQueries.actualizar).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].codigo).toBe('MONTO_REQUERIDO');
  });

  it('permite editar el modo sin tocar la cantidad', async () => {
    aportacionesQueries.actualizar.mockResolvedValue({ id: 'ap-1', id_indicador: 'ind-1' });
    aportacionesQueries.obtenerConNodo.mockResolvedValue(null);
    const pool = require('../db/pool');
    pool.query.mockResolvedValue({ rows: [{ id_proyecto: 'p-1', nombre: 'Indicador 1' }] });

    const res = crearRes();
    await actualizar({ params: { id: 'ap-1' }, body: { modo: 'proporcional' }, usuario: {} }, res, jest.fn());

    expect(aportacionesQueries.actualizar).toHaveBeenCalledWith('ap-1', { modo: 'proporcional' });
    expect(res.json).toHaveBeenCalled();
  });
});
