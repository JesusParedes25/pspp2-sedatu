/**
 * ARCHIVO: publico-indicadores.test.js
 * PROPÓSITO: GET /publico/indicadores.
 *            - Comportamiento heredado de los PR #170/#171 (se conserva
 *              igual en esta reescritura): el barrido general se acota
 *              por omisión a indicadores con al menos un proyecto que
 *              los mida (`?todos=1` recupera el comportamiento anterior);
 *              `?clave=` es una consulta puntual que SIEMPRE devuelve su
 *              indicador, con meta_total/avance_total en 0 y
 *              proyectos: [] si no tiene ninguno vinculado (nunca 404 ni
 *              lista vacía); la nota de mantenimiento interna
 *              ("⚠ Revisar: ...") nunca sale en `definicion`/`fuente`;
 *              `activo` viaja igual, sin filtrar por él, para que decida
 *              el consumidor.
 *            - Bloques A-D (este PR): identidad institucional del
 *              indicador (id/instrumento/categoria/objetivo/estrategia/
 *              linea/area_responsable/fuente_oficial/origen), nodos que
 *              aportan con su territorio propio/efectivo, histórico por
 *              movimiento individual (no agrupado por día) con
 *              periodos mensuales, por_dependencia, y los filtros
 *              ?dg=/?instrumento=/?cve_ent=.
 *
 * Los mocks de `pool.query` se resuelven por el texto de la consulta
 * (no por orden de llamada): el controlador hace un número de consultas
 * distinto según si el indicador tiene aportaciones/nodos o no, y atar
 * el mock al orden exacto de llamadas lo haría frágil ante cualquier
 * reordenamiento interno que no cambie el contrato de la respuesta.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/pool', () => ({ query: jest.fn() }));

const pool = require('../db/pool');
const { indicadores } = require('../controllers/publico.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

// Resuelve cada pool.query según el texto de la consulta, no según el
// orden en que el controlador las dispara. Las respuestas no cubiertas
// explícitamente por `respuestas` devuelven `rows: []` (equivalente a
// "este indicador no tiene aportaciones/territorio/movimientos").
function mockearPool(respuestas = {}) {
  pool.query.mockImplementation((sql) => {
    if (sql.includes('FROM catalogo_indicadores c')) return Promise.resolve({ rows: respuestas.principal || [] });
    if (sql.includes('LEFT JOIN usuarios u')) return Promise.resolve({ rows: respuestas.movimientos || [] });
    if (sql.includes('FROM indicador_aportaciones')) return Promise.resolve({ rows: respuestas.aportaciones || [] });
    if (sql.includes('GROUP BY id_indicador, id_nodo_origen')) return Promise.resolve({ rows: respuestas.aportado || [] });
    if (sql.includes('FROM etapas e')) return Promise.resolve({ rows: respuestas.etapas || [] });
    if (sql.includes('FROM acciones a')) return Promise.resolve({ rows: respuestas.acciones || [] });
    if (sql.includes('FROM tareas t')) return Promise.resolve({ rows: respuestas.tareas || [] });
    if (sql.includes('FROM geo_estados')) return Promise.resolve({ rows: respuestas.geoEstados || [] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => { jest.clearAllMocks(); });

const FILA_SIN_PROYECTO = {
  clave: 'sin-uso', nombre: 'Indicador institucional sin uso', descripcion: null,
  tipo: 'Otro', unidad: 'Numero', unidad_personalizada: null, etiqueta_unidad: null,
  definicion: null, fuente: null, activo: true,
  instrumento: null, categoria: null, area_sugerida: null, codigo_linea_accion: null,
  fuente_oficial: null,
  indicador_id: null, meta_global: null, valor_actual: null,
  proyecto_id: null, proyecto_nombre: null, proyecto_estado: null,
  dg_siglas: null, actualizado_en: null,
};

const FILA_CON_PROYECTO = {
  clave: 'viviendas', nombre: 'Viviendas mejoradas', descripcion: 'desc',
  tipo: 'Avance_fisico', unidad: 'Numero', unidad_personalizada: null, etiqueta_unidad: 'viviendas',
  definicion: '⚠ Revisar: unidad original \'Nombre\' — no es un valor numérico.',
  fuente: 'Padrón único',
  activo: true,
  instrumento: 'PSEDATU 2025-2030', categoria: 'Promover vivienda digna',
  area_sugerida: 'DGOTU; DGPV', codigo_linea_accion: '4.7.9',
  fuente_oficial: 'Anexo Estadístico PND, página 261',
  indicador_id: 'ind-1', meta_global: 5000, valor_actual: 1200,
  proyecto_id: 'p-1', proyecto_nombre: 'Proyecto 1', proyecto_estado: 'En_proceso',
  dg_siglas: 'DGOTU', actualizado_en: '2026-10-01T00:00:00.000Z',
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
    mockearPool({ principal: [FILA_SIN_PROYECTO] });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    expect(pool.query.mock.calls[0][1]).toEqual([null]);
    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(0);
  });

  it('?todos=1: conserva el que no tiene proyecto', async () => {
    mockearPool({ principal: [FILA_SIN_PROYECTO] });
    const req = { query: { todos: '1' } };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0].clave).toBe('sin-uso');
  });

  it('?clave=: devuelve el indicador aunque no tenga proyectos, con totales en 0 y proyectos: [] — nunca 404 ni lista vacía', async () => {
    mockearPool({ principal: [FILA_SIN_PROYECTO] });
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
    mockearPool({
      principal: [FILA_INACTIVA_CON_PROYECTO],
      movimientos: [{ id_indicador: 'ind-2', fecha: new Date('2026-10-01'), cantidad: '1200', id_nodo_origen: null, registrado_por: 'Ana' }],
    });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0]).toMatchObject({ clave: 'retirado-con-captura', activo: false, avance_total: 1200 });
  });

  it('nunca entrega la nota de mantenimiento interna en definicion/fuente', async () => {
    mockearPool({
      principal: [FILA_CON_PROYECTO],
      movimientos: [{ id_indicador: 'ind-1', fecha: new Date('2026-10-01'), cantidad: '1200', id_nodo_origen: null, registrado_por: 'Ana' }],
    });
    const req = { query: {} };
    const res = crearRes();
    await indicadores(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.datos).toHaveLength(1);
    expect(body.datos[0].definicion).toBeNull();
    expect(body.datos[0].fuente).toBe('Padrón único');
  });

  describe('Bloque A: identidad institucional', () => {
    it('expone id (UUID del catálogo), psedatu derivado de codigo_linea_accion, area_responsable como arreglo y origen institucional/plataforma', async () => {
      mockearPool({ principal: [{ ...FILA_CON_PROYECTO, catalogo_id: 'cat-1' }] });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const ind = res.json.mock.calls[0][0].datos[0];
      expect(ind.instrumento).toBe('PSEDATU 2025-2030');
      expect(ind.categoria).toBe('Promover vivienda digna');
      expect(ind.fuente_oficial).toBe('Anexo Estadístico PND, página 261');
      expect(ind.objetivo).toBe('4');
      expect(ind.estrategia).toBe('4.7');
      expect(ind.linea).toBe('4.7.9');
      expect(ind.area_responsable).toEqual(['DGOTU', 'DGPV']);
      expect(ind.origen).toBe('institucional');
    });

    it('un indicador sin instrumento (dado de alta en la plataforma) tiene origen "plataforma" y psedatu nulo', async () => {
      mockearPool({ principal: [{ ...FILA_SIN_PROYECTO, instrumento: null, codigo_linea_accion: null, area_sugerida: null }] });
      const req = { query: { todos: '1' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const ind = res.json.mock.calls[0][0].datos[0];
      expect(ind.origen).toBe('plataforma');
      expect(ind.objetivo).toBeNull();
      expect(ind.area_responsable).toEqual([]);
    });
  });

  describe('Bloque B: nodos que aportan y su territorio', () => {
    it('una acción sin territorio propio hereda el de su etapa en territorio_efectivo, dejando territorio_propio vacío', async () => {
      mockearPool({
        principal: [FILA_CON_PROYECTO],
        aportaciones: [{ id: 'ap-1', id_indicador: 'ind-1', aportacion: '30', modo: 'al_concluir', id_etapa: null, id_accion: 'acc-1', id_tarea: null }],
        acciones: [{ id: 'acc-1', nombre: 'Acción sin territorio propio', estado: 'Completada', cve_ent: null, id_etapa: 'et-1', id_accion_padre: null, municipios: [] }],
        etapas: [{ id: 'et-1', nombre: 'Etapa 1', estado: 'En_proceso', cve_ent: '18', municipios: [{ cve_mun: '18008', nombre: 'Compostela' }] }],
        geoEstados: [{ cve_ent: '18', nombre: 'NAYARIT' }],
      });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const nodo = res.json.mock.calls[0][0].datos[0].proyectos[0].nodos[0];
      expect(nodo).toMatchObject({ nodo_id: 'acc-1', tipo: 'Accion', estado: 'Completada', modo: 'manual', aportacion_declarada: 30, aportado: 0, fecha_aporte: null });
      expect(nodo.territorio_propio).toEqual({ entidad: null, municipios: [] });
      expect(nodo.territorio_efectivo).toEqual({ entidad: { cve_ent: '18', nombre: 'NAYARIT' }, municipios: [{ cve_mun: '18008', nombre: 'Compostela' }] });
    });

    it('un nodo sin territorio capturado en ningún nivel devuelve arreglo de municipios vacío, nunca el campo omitido', async () => {
      mockearPool({
        principal: [FILA_CON_PROYECTO],
        aportaciones: [{ id: 'ap-1', id_indicador: 'ind-1', aportacion: '10', modo: 'proporcional', id_etapa: 'et-2', id_accion: null, id_tarea: null }],
        etapas: [{ id: 'et-2', nombre: 'Etapa sin territorio', estado: 'Pendiente', cve_ent: null, municipios: [] }],
      });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const nodo = res.json.mock.calls[0][0].datos[0].proyectos[0].nodos[0];
      expect(nodo.territorio_propio).toEqual({ entidad: null, municipios: [] });
      expect(nodo.territorio_efectivo).toEqual({ entidad: null, municipios: [] });
    });

    it('?cve_ent= recorta el arreglo nodos del proyecto a los que caen en esa entidad, sin quitar el proyecto ni el indicador', async () => {
      mockearPool({
        principal: [FILA_CON_PROYECTO],
        aportaciones: [
          { id: 'ap-1', id_indicador: 'ind-1', aportacion: '30', modo: 'al_concluir', id_etapa: null, id_accion: 'acc-ny', id_tarea: null },
          { id: 'ap-2', id_indicador: 'ind-1', aportacion: '20', modo: 'al_concluir', id_etapa: null, id_accion: 'acc-jal', id_tarea: null },
        ],
        acciones: [
          { id: 'acc-ny', nombre: 'Acción Nayarit', estado: 'Completada', cve_ent: '18', id_etapa: null, id_accion_padre: null, municipios: [] },
          { id: 'acc-jal', nombre: 'Acción Jalisco', estado: 'Completada', cve_ent: '14', id_etapa: null, id_accion_padre: null, municipios: [] },
        ],
        geoEstados: [{ cve_ent: '18', nombre: 'NAYARIT' }, { cve_ent: '14', nombre: 'JALISCO' }],
      });
      const req = { query: { clave: 'viviendas', cve_ent: '18' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const proyecto = res.json.mock.calls[0][0].datos[0].proyectos[0];
      expect(proyecto.nodos).toHaveLength(1);
      expect(proyecto.nodos[0].nodo_id).toBe('acc-ny');
    });
  });

  describe('Bloque C: histórico, periodos y por_dependencia', () => {
    it('dos movimientos del mismo día de nodos distintos quedan como dos entradas de histórico, nunca colapsadas en una suma', async () => {
      mockearPool({
        principal: [FILA_CON_PROYECTO],
        movimientos: [
          { id_indicador: 'ind-1', fecha: new Date('2026-09-15'), cantidad: '50', id_nodo_origen: 'acc-1', registrado_por: 'Ana' },
          { id_indicador: 'ind-1', fecha: new Date('2026-10-10'), cantidad: '3', id_nodo_origen: 'tar-1', registrado_por: 'Ana' },
          { id_indicador: 'ind-1', fecha: new Date('2026-10-10'), cantidad: '1', id_nodo_origen: null, registrado_por: 'Beto' },
        ],
      });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const proyecto = res.json.mock.calls[0][0].datos[0].proyectos[0];
      expect(proyecto.historico).toHaveLength(3);
      expect(proyecto.historico[1]).toMatchObject({ movimiento: 3, acumulado: 53, nodo_id: 'tar-1', registrado_por: 'Ana' });
      expect(proyecto.historico[2]).toMatchObject({ movimiento: 1, acumulado: 54, nodo_id: null, registrado_por: 'Beto' });
      expect(proyecto.ultima_captura_por).toBe('Beto');
      expect(proyecto.fecha_corte).toEqual(new Date('2026-10-10'));
    });

    it('agrupa los movimientos del mismo mes en un solo periodo con anio separado y el acumulado_al_cierre correcto', async () => {
      mockearPool({
        principal: [FILA_CON_PROYECTO],
        movimientos: [
          { id_indicador: 'ind-1', fecha: new Date('2026-09-15'), cantidad: '50', id_nodo_origen: null, registrado_por: 'Ana' },
          { id_indicador: 'ind-1', fecha: new Date('2026-10-10'), cantidad: '3', id_nodo_origen: null, registrado_por: 'Ana' },
          { id_indicador: 'ind-1', fecha: new Date('2026-10-10'), cantidad: '1', id_nodo_origen: null, registrado_por: 'Beto' },
        ],
      });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const periodos = res.json.mock.calls[0][0].datos[0].proyectos[0].periodos;
      expect(periodos).toEqual([
        { periodo: '2026-09', anio: 2026, movimiento: 50, acumulado_al_cierre: 50 },
        { periodo: '2026-10', anio: 2026, movimiento: 4, acumulado_al_cierre: 54 },
      ]);
    });

    it('por_dependencia suma exacto lo de los proyectos de cada DG, con un corte por DG', async () => {
      mockearPool({
        principal: [
          FILA_CON_PROYECTO,
          { ...FILA_CON_PROYECTO, indicador_id: 'ind-3', proyecto_id: 'p-3', proyecto_nombre: 'Proyecto 3', meta_global: 1000, valor_actual: 300, dg_siglas: 'DGOTU' },
          { ...FILA_CON_PROYECTO, indicador_id: 'ind-4', proyecto_id: 'p-4', proyecto_nombre: 'Proyecto 4', meta_global: 2000, valor_actual: 500, dg_siglas: 'DGPV' },
        ],
      });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const porDep = res.json.mock.calls[0][0].datos[0].por_dependencia;
      expect(porDep).toEqual([
        { siglas: 'DGOTU', suma_metas: 6000, suma_avances: 1500, num_proyectos: 2, fecha_corte_mas_reciente: null },
        { siglas: 'DGPV', suma_metas: 2000, suma_avances: 500, num_proyectos: 1, fecha_corte_mas_reciente: null },
      ]);
    });
  });

  describe('Bloque D: filtros y agregación', () => {
    it('?dg= y ?instrumento= se combinan y se agregan como condiciones parametrizadas', async () => {
      mockearPool({ principal: [] });
      const req = { query: { todos: '1', dg: 'DGOTU', instrumento: 'PSEDATU 2025-2030' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const [sql, valores] = pool.query.mock.calls[0];
      expect(sql).toContain('dg.siglas = $2');
      expect(sql).toContain('c.instrumento = $3');
      expect(valores).toEqual([null, 'DGOTU', 'PSEDATU 2025-2030']);
    });

    it('un indicador en Porcentaje es sumable:false y deja meta_total/avance_total/porcentaje/por_dependencia en null', async () => {
      const FILA_PORCENTAJE = { ...FILA_CON_PROYECTO, unidad: 'Porcentaje' };
      mockearPool({ principal: [FILA_PORCENTAJE] });
      const req = { query: { clave: 'viviendas' } };
      const res = crearRes();
      await indicadores(req, res, jest.fn());

      const ind = res.json.mock.calls[0][0].datos[0];
      expect(ind.sumable).toBe(false);
      expect(ind.meta_total).toBeNull();
      expect(ind.avance_total).toBeNull();
      expect(ind.porcentaje).toBeNull();
      expect(ind.por_dependencia).toEqual([{ siglas: 'DGOTU', suma_metas: null, suma_avances: null, num_proyectos: 1, fecha_corte_mas_reciente: null }]);
      // El dato crudo por proyecto se conserva igual: el consumidor puede
      // leerlo, solo se le niega la auto-agregación sin sentido.
      expect(ind.proyectos[0].meta).toBe(5000);
      expect(ind.proyectos[0].avance).toBe(1200);
    });
  });
});
