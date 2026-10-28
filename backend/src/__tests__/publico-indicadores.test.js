/**
 * ARCHIVO: publico-indicadores.test.js
 * PROPÓSITO: GET /publico/indicadores — Bloques B2/B3 reportados tras el
 *            PR #170, y la corrección pedida sobre B3 en la revisión del
 *            PR #171:
 *            - B2: el barrido general se acota por omisión a indicadores
 *              con al menos un proyecto que los mida (antes devolvía las
 *              ~1400 entradas institucionales, la mayoría sin ningún
 *              proyecto). `?todos=1` recupera el comportamiento anterior;
 *              `?clave=` sigue siendo una consulta puntual que no pasa por
 *              ese filtro — SIEMPRE devuelve su indicador, con
 *              meta_total/avance_total en 0 y proyectos: [] si no tiene
 *              ninguno vinculado (nunca 404 ni lista vacía).
 *            - B3: la nota de mantenimiento interna ("⚠ Revisar: ...")
 *              nunca sale en `definicion`/`fuente`. El filtro por
 *              `activo` que sí se agregó en el PR #170 se retiró en el
 *              #171: un indicador inactivo en el catálogo pero con
 *              proyecto y captura real NO debe desaparecer sin aviso de
 *              la respuesta — `activo` viaja igual para que decida el
 *              consumidor.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/pool', () => ({ query: jest.fn() }));

const pool = require('../db/pool');
const { indicadores } = require('../controllers/publico.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

const FILA_SIN_PROYECTO = {
  clave: 'sin-uso', nombre: 'Indicador institucional sin uso', descripcion: null,
  tipo: 'Otro', unidad: 'Numero', unidad_personalizada: null, etiqueta_unidad: null,
  definicion: null, fuente: null, activo: true,
  indicador_id: null, meta_global: null, valor_actual: null,
  proyecto_id: null, proyecto_nombre: null, proyecto_estado: null,
  dg_siglas: null, capturado_por: null, actualizado_en: null,
};

const FILA_CON_PROYECTO = {
  clave: 'viviendas', nombre: 'Viviendas mejoradas', descripcion: 'desc',
  tipo: 'Avance_fisico', unidad: 'Numero', unidad_personalizada: null, etiqueta_unidad: 'viviendas',
  definicion: '⚠ Revisar: unidad original \'Nombre\' — no es un valor numérico.',
  fuente: 'Padrón único',
  activo: true,
  indicador_id: 'ind-1', meta_global: 5000, valor_actual: 1200,
  proyecto_id: 'p-1', proyecto_nombre: 'Proyecto 1', proyecto_estado: 'En_proceso',
  dg_siglas: 'DGOTU', capturado_por: 'Ana', actualizado_en: '2026-10-01T00:00:00.000Z',
};

// Catálogo retirado (activo:false) pero con un proyecto que ya lo capturaba.
const FILA_INACTIVA_CON_PROYECTO = {
  ...FILA_CON_PROYECTO,
  clave: 'retirado-con-captura', nombre: 'Indicador retirado del catálogo', activo: false,
  definicion: 'Definición real, sin nota interna', fuente: 'Fuente real',
  indicador_id: 'ind-2',
};

describe('GET /publico/indicadores', () => {
  it('sin parámetros: solo filtra por clave en la consulta (ya no por activo) y descarta el que no tiene proyecto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual([null]);
    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(0);
  });

  it('?todos=1: conserva el que no tiene proyecto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: { todos: '1' } };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0].clave).toBe('sin-uso');
  });

  it('?clave=: devuelve el indicador aunque no tenga proyectos, con totales en 0 y proyectos: [] — nunca 404 ni lista vacía', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: { clave: 'sin-uso' } };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual(['sin-uso']);
    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(1);
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0]).toMatchObject({ meta_total: 0, avance_total: 0, proyectos: [] });
  });

  it('un indicador activo:false con proyecto y captura real SIGUE apareciendo (no se filtra por activo)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [FILA_INACTIVA_CON_PROYECTO] })
      .mockResolvedValueOnce({ rows: [{ id_indicador: 'ind-2', fecha_corte: '2026-10-01' }] })
      .mockResolvedValueOnce({ rows: [{ id_indicador: 'ind-2', fecha: '2026-10-01', delta: '1200' }] });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0]).toMatchObject({ clave: 'retirado-con-captura', activo: false, avance_total: 1200 });
  });

  it('nunca entrega la nota de mantenimiento interna en definicion/fuente', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [FILA_CON_PROYECTO] })
      .mockResolvedValueOnce({ rows: [{ id_indicador: 'ind-1', fecha_corte: '2026-10-01' }] })
      .mockResolvedValueOnce({ rows: [{ id_indicador: 'ind-1', fecha: '2026-10-01', delta: '1200' }] });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0].definicion).toBeNull();
    expect(body.datos[0].fuente).toBe('Padrón único');
  });
});
