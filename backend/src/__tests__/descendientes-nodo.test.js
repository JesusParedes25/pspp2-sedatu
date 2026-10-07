/**
 * ARCHIVO: descendientes-nodo.test.js
 * PROPÓSITO: Tests del helper compartido de descendientes
 *            (backend/src/utils/descendientes-nodo.js) que alimenta la
 *            agregación de las pestañas Documentos/Indicadores/Riesgos de
 *            Detalle (Fase 4) — confirma que etapa/acción/tarea resuelven
 *            el subárbol correcto (acción → subacciones → tareas) y que
 *            "Solo este elemento" (idsSoloPropio) nunca trae descendientes.
 *
 * Ejecutar: npm test
 */
const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args) => mockQuery(...args)
}));

const { idsDescendientes, idsSoloPropio, idsNodoYDescendientes } = require('../utils/descendientes-nodo');

const mockRows = (rows) => ({ rows });

beforeEach(() => {
  mockQuery.mockReset();
});

describe('idsDescendientes', () => {
  test('tarea: siempre hoja, sin consultar la base de datos', async () => {
    const res = await idsDescendientes('tarea', 'T1');
    expect(res).toEqual({ etapaIds: [], accionIds: [], tareaIds: ['T1'] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('accion: incluye la propia acción + sus subacciones, y las tareas de ambas', async () => {
    mockQuery
      .mockResolvedValueOnce(mockRows([{ id: 'SUB1' }, { id: 'SUB2' }])) // subacciones de A1
      .mockResolvedValueOnce(mockRows([{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }])); // tareas de [A1,SUB1,SUB2]

    const res = await idsDescendientes('accion', 'A1');

    expect(res).toEqual({
      etapaIds: [],
      accionIds: ['A1', 'SUB1', 'SUB2'],
      tareaIds: ['T1', 'T2', 'T3'],
    });
    expect(mockQuery).toHaveBeenNthCalledWith(1,
      'SELECT id FROM acciones WHERE id_accion_padre = $1', ['A1']);
    expect(mockQuery).toHaveBeenNthCalledWith(2,
      'SELECT id FROM tareas WHERE id_accion = ANY($1)', [['A1', 'SUB1', 'SUB2']]);
  });

  test('accion sin subacciones ni tareas: arreglos vacíos, sin tercera consulta', async () => {
    mockQuery
      .mockResolvedValueOnce(mockRows([])) // sin subacciones
      .mockResolvedValueOnce(mockRows([])); // sin tareas

    const res = await idsDescendientes('accion', 'A1');
    expect(res).toEqual({ etapaIds: [], accionIds: ['A1'], tareaIds: [] });
  });

  test('etapa: agrega acciones + subacciones de cada una + tareas de todas', async () => {
    mockQuery
      .mockResolvedValueOnce(mockRows([{ id: 'A1' }, { id: 'A2' }])) // acciones de la etapa
      .mockResolvedValueOnce(mockRows([{ id: 'SUB1' }])) // subacciones de [A1,A2]
      .mockResolvedValueOnce(mockRows([{ id: 'T1' }, { id: 'T2' }])); // tareas de [A1,A2,SUB1]

    const res = await idsDescendientes('etapa', 'E1');

    expect(res).toEqual({
      etapaIds: ['E1'],
      accionIds: ['A1', 'A2', 'SUB1'],
      tareaIds: ['T1', 'T2'],
    });
    expect(mockQuery).toHaveBeenNthCalledWith(1, 'SELECT id FROM acciones WHERE id_etapa = $1', ['E1']);
    expect(mockQuery).toHaveBeenNthCalledWith(2,
      'SELECT id FROM acciones WHERE id_accion_padre = ANY($1)', [['A1', 'A2']]);
    expect(mockQuery).toHaveBeenNthCalledWith(3,
      'SELECT id FROM tareas WHERE id_accion = ANY($1)', [['A1', 'A2', 'SUB1']]);
  });

  test('etapa sin acciones: no consulta subacciones ni tareas (arreglos vacíos de entrada)', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([])); // sin acciones

    const res = await idsDescendientes('etapa', 'E1');
    expect(res).toEqual({ etapaIds: ['E1'], accionIds: [], tareaIds: [] });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('idsSoloPropio', () => {
  test('etapa: solo su propio id, nunca descendientes, sin consultar la base de datos', () => {
    const res = idsSoloPropio('etapa', 'E1');
    expect(res).toEqual({ etapaIds: ['E1'], accionIds: [], tareaIds: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('accion: solo su propio id', () => {
    expect(idsSoloPropio('accion', 'A1')).toEqual({ etapaIds: [], accionIds: ['A1'], tareaIds: [] });
  });

  test('tarea: solo su propio id', () => {
    expect(idsSoloPropio('tarea', 'T1')).toEqual({ etapaIds: [], accionIds: [], tareaIds: ['T1'] });
  });
});

describe('idsNodoYDescendientes', () => {
  test('incluirHijos=false usa idsSoloPropio, sin tocar la base de datos', async () => {
    const res = await idsNodoYDescendientes('etapa', 'E1', false);
    expect(res).toEqual({ etapaIds: ['E1'], accionIds: [], tareaIds: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('incluirHijos=true (u omitido) agrega el subárbol completo', async () => {
    mockQuery
      .mockResolvedValueOnce(mockRows([{ id: 'A1' }]))
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([{ id: 'T1' }]));

    const res = await idsNodoYDescendientes('etapa', 'E1', true);
    expect(res).toEqual({ etapaIds: ['E1'], accionIds: ['A1'], tareaIds: ['T1'] });
  });
});
