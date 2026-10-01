/**
 * ARCHIVO: importar-propagacion-avance.test.js
 * PROPÓSITO: Reproduce y cubre el bug reportado — "el avance importado
 *            desde Excel no actualiza el estatus ni propaga al nodo
 *            padre". Confirmado leyendo el código: al importar Tareas
 *            (nivel "subaccion" en el importador) bajo una Acción ya
 *            existente, el INSERT de la Tarea nunca disparaba el
 *            recálculo de su Acción contenedora — a diferencia del
 *            flujo manual (tareas.controller.js::crear), que sí llama
 *            `avanceSemaforo.recalcularPadres('accion', ...)` tras crear
 *            una tarea. Este test verifica justo esa llamada.
 *
 * Mockea `pool`/`client.query` con un dispatcher por texto de SQL (en
 * vez de una cola `mockReturnValueOnce`) porque `ejecutarImportacion`
 * hace muchas consultas de soporte (duplicados, pesos, etc.) que no son
 * el objeto de este test — solo interesa comprobar que, tras insertar
 * una Tarea bajo una Acción existente, se llama a
 * `avanceSemaforo.recalcularPadres('accion', <id de esa Acción>, ...)`
 * antes del COMMIT.
 *
 * Ejecutar: npm test
 */

const ETAPA_ID = '00000000-0000-0000-0000-000000000001';
const ACCION_ID = '00000000-0000-0000-0000-000000000002';
const PROYECTO_ID = '00000000-0000-0000-0000-0000000000f1';
const ACCION_NOMBRE = 'Acción contenedora de prueba';

function normalizarTextoLocal(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function dispatchQuery(sqlRaw) {
  const s = sqlRaw.replace(/\s+/g, ' ').trim();

  if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
  if (s.includes('MAX(orden)')) return { rows: [{ max_orden: 0 }] };
  if (s.includes('id_creador FROM proyectos')) return { rows: [{ id_creador: null }] };

  // acciones existentes (detectarDuplicados — trae id_accion_padre)
  if (s.includes('id, nombre, id_accion_padre FROM acciones')) {
    return { rows: [{ id: ACCION_ID, nombre: ACCION_NOMBRE, id_accion_padre: null }] };
  }
  // acciones existentes (preload del cliente — sin id_accion_padre en el SELECT)
  if (s.includes('id, nombre FROM acciones')) {
    return { rows: [{ id: ACCION_ID, nombre: ACCION_NOMBRE }] };
  }
  // acciones existentes (detectarPosiblesDuplicadosPadre — solo nombre)
  if (s.includes('nombre FROM acciones')) {
    return { rows: [{ nombre: ACCION_NOMBRE }] };
  }
  // etapas existentes (detectarDuplicados / preload del cliente — con id)
  if (s.includes('id, nombre FROM etapas')) {
    return { rows: [{ id: ETAPA_ID, nombre: 'Etapa de prueba' }] };
  }
  // etapas existentes (detectarPosiblesDuplicadosPadre — solo nombre)
  if (s.includes('nombre FROM etapas')) {
    return { rows: [{ nombre: 'Etapa de prueba' }] };
  }
  // Resolver la etapa de la acción padre, al vincular la tarea
  if (s.includes('id_etapa FROM acciones WHERE id')) {
    return { rows: [{ id_etapa: ETAPA_ID }] };
  }
  if (s.includes('INSERT INTO tareas')) return { rows: [] };
  if (s.includes('INSERT INTO etapas')) return { rows: [{ id: '00000000-0000-0000-0000-000000000099' }] };

  throw new Error('Query no mockeada en este test: ' + s);
}

const mockPoolQuery = jest.fn((sql) => Promise.resolve(dispatchQuery(sql)));
const mockClientQuery = jest.fn((sql) => Promise.resolve(dispatchQuery(sql)));
const mockClientRelease = jest.fn();

jest.mock('../db/pool', () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: () => Promise.resolve({ query: mockClientQuery, release: mockClientRelease }),
}));

const mockRecalcularPadres = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/avance-semaforo', () => ({
  recalcularPadres: (...args) => mockRecalcularPadres(...args),
}));

const mockRecalcularPesosEtapa = jest.fn().mockResolvedValue(undefined);
jest.mock('../db/queries/acciones.queries', () => ({
  recalcularPesosEtapa: (...args) => mockRecalcularPesosEtapa(...args),
}));

const mockRecalcularEtapa = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/recalculos', () => ({
  recalcularEtapa: (...args) => mockRecalcularEtapa(...args),
}));

const mockRecalcularIndicadoresProyecto = jest.fn().mockResolvedValue(undefined);
jest.mock('../db/queries/indicadores.queries', () => ({
  recalcularIndicadoresProyecto: (...args) => mockRecalcularIndicadoresProyecto(...args),
}));

const { ejecutarImportacion } = require('../services/importar.service');

beforeEach(() => {
  mockPoolQuery.mockClear();
  mockClientQuery.mockClear();
  mockClientRelease.mockClear();
  mockRecalcularPadres.mockClear();
  mockRecalcularPesosEtapa.mockClear();
  mockRecalcularEtapa.mockClear();
  mockRecalcularIndicadoresProyecto.mockClear();
});

describe('ejecutarImportacion — propagación de avance de Tareas a su Acción contenedora', () => {
  test('al importar una Tarea bajo una Acción ya existente, llama a recalcularPadres sobre esa Acción', async () => {
    // Hoja de "Tareas" (rowLevel='subaccion'): nombre, estado, % avance, y
    // una columna de "acción padre" (parentColumn) que calza EXACTO con el
    // nombre de la Acción ya existente en el proyecto (ACCION_NOMBRE) —
    // así el importador la resuelve por nombre en vez de crear una nueva.
    const dataRows = [
      ['Tarea importada de prueba', 'En_proceso', '80', ACCION_NOMBRE],
    ];
    const config = {
      columnMap: { 0: 'nombre', 1: 'estado', 2: 'porcentaje_avance' },
      parentColumn: 3,
      rowLevel: 'subaccion',
    };
    const headers = ['Nombre', 'Estado', '% Avance', 'Acción'];

    const resultado = await ejecutarImportacion(dataRows, config, headers, PROYECTO_ID, true, null, 'prueba.xlsx');

    expect(resultado.tareas_creadas).toBe(1);

    // El corazón del bug: sin el fix, nunca se llamaba a recalcularPadres
    // tras insertar la tarea — la Acción (y por tanto su Etapa) se
    // quedaban con el avance/estado que tenían antes de importar.
    expect(mockRecalcularPadres).toHaveBeenCalledWith('accion', ACCION_ID, expect.anything());

    // Debe correr ANTES del recálculo de etapa (que lee
    // acciones.porcentaje_avance tal cual esté en ese momento) — si se
    // invirtiera el orden, la etapa recalcularía con el valor viejo.
    const ordenRecalcularPadres = mockRecalcularPadres.mock.invocationCallOrder[0];
    const ordenRecalcularEtapa = mockRecalcularEtapa.mock.invocationCallOrder[0];
    expect(ordenRecalcularPadres).toBeLessThan(ordenRecalcularEtapa);

    // Debe correr dentro de la misma transacción (antes de COMMIT), no
    // después — si corriera post-commit y algo fallara a medio camino,
    // la tarea quedaría guardada con su padre desincronizado.
    const llamadasCommit = mockClientQuery.mock.calls
      .map((args, i) => ({ sql: args[0], i }))
      .filter(c => c.sql === 'COMMIT');
    expect(llamadasCommit.length).toBe(1);
    expect(ordenRecalcularPadres).toBeLessThan(mockClientQuery.mock.invocationCallOrder[llamadasCommit[0].i]);
  });

  test('no llama a recalcularPadres cuando no se importa ninguna Tarea', async () => {
    // Caso de control: una Etapa suelta, sin Tareas — nada que propagar.
    const dataRows = [
      ['Etapa importada de prueba', 'Pendiente', ''],
    ];
    const config = {
      columnMap: { 0: 'nombre', 1: 'estado' },
      rowLevel: 'etapa',
    };
    const headers = ['Nombre', 'Estado'];

    await ejecutarImportacion(dataRows, config, headers, PROYECTO_ID, true, null, 'prueba.xlsx');

    expect(mockRecalcularPadres).not.toHaveBeenCalled();
  });
});
