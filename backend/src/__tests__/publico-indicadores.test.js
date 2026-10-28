/**
 * ARCHIVO: publico-indicadores.test.js
 * PROPÓSITO: GET /publico/indicadores — Bloque B2/B3 reportados tras el
 *            PR #170: por omisión el barrido general se acota a
 *            indicadores activos en el catálogo y con al menos un
 *            proyecto que los mida (antes devolvía las ~1400 entradas
 *            institucionales, la mayoría sin ningún proyecto). `?todos=1`
 *            recupera el comportamiento anterior; `?clave=` sigue siendo
 *            una consulta puntual que no pasa por ninguno de los dos
 *            filtros. También cubre que una nota de mantenimiento interna
 *            ("⚠ Revisar: ...") nunca sale en `definicion`/`fuente`.
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

describe('GET /publico/indicadores', () => {
  it('sin parámetros: omite activo=false/con proyecto en la consulta y descarta el que no tiene proyecto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual([null, false]);
    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(0);
  });

  it('?todos=1: pide el catálogo sin filtrar por activo y conserva el que no tiene proyecto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: { todos: '1' } };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual([null, true]);
    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0].clave).toBe('sin-uso');
  });

  it('?clave=: es una consulta puntual, no pasa por el filtro de activo/proyecto', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FILA_SIN_PROYECTO] });
    const req = { query: { clave: 'sin-uso' } };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual(['sin-uso', true]);
    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
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
