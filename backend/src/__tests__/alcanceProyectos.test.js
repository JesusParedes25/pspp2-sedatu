/**
 * ARCHIVO: alcanceProyectos.test.js
 * PROPÓSITO: El bono institucional en alcanceProyectosUsuario/
 *            alcanceProyectosUsuarioONull (docs/modelo-permisos.md
 *            sección 9) — dos niveles distintos desde el paso 15 DGTIC:
 *
 *            - `direccion_general`: unión de (1) los proyectos donde
 *              participa y (2) los proyectos cuya id_dg_lider es su
 *              propia DG (Fase 2/Paso 2, sin cambios en este paso).
 *            - `direccion`: unión de (1) los proyectos donde participa
 *              y (2) los proyectos cuya id_direccion_area_lider es su
 *              propia Dirección de Área (CAMBIO 1, paso 15 DGTIC — antes
 *              era también a nivel DG completa, igual que
 *              direccion_general).
 *
 *            Ambos bonos se resuelven comparando la columna del proyecto
 *            directamente contra la del usuario, nunca cruzando
 *            proyecto_usuarios/nodo_miembros de terceros.
 *
 * Ejecutar: npm test
 */

const UUID_PROPIO = '00000000-0000-0000-0000-000000000001'; // participación directa
const UUID_DG = '00000000-0000-0000-0000-000000000002'; // de su propia DG, sin participar
const UUID_AREA = '00000000-0000-0000-0000-000000000003'; // de su propia área, sin participar

jest.mock('../db/pool', () => ({ query: jest.fn() }));
jest.mock('../db/queries/miembros.queries', () => ({ obtenerProyectosUsuario: jest.fn() }));
jest.mock('../db/queries/carteras.queries', () => ({ obtenerProyectoIdsDeCartera: jest.fn() }));

const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');
const { alcanceProyectosUsuario, alcanceProyectosUsuarioONull } = require('../utils/alcanceProyectos');

beforeEach(() => jest.clearAllMocks());

describe('alcanceProyectosUsuario — superadmin/ejecutivo (sin cambio)', () => {
  test.each(['superadmin', 'ejecutivo'])('%s recibe todos los proyectos activos, sin tocar membresía', async (rol) => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PROPIO }, { id: UUID_DG }] });
    const resultado = await alcanceProyectosUsuario({ rol });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
    expect(miembrosQueries.obtenerProyectosUsuario).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuario — direccion, el bono de su Dirección de Área (paso 15 DGTIC, CAMBIO 1)', () => {
  test('recibe la unión de su participación y los proyectos de su propia área', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_AREA }] });
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_direccion_area: 'area-1' });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_AREA].sort());
  });

  test('sin duplicar si un proyecto está en ambos conjuntos (participa Y es de su área)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PROPIO }] });
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_direccion_area: 'area-1' });
    expect(resultado).toEqual([UUID_PROPIO]);
  });

  // Fija la definición exacta del bono: se resuelve SOLO comparando
  // proyectos.id_direccion_area_lider contra usuario.id_direccion_area, y
  // NUNCA contra id_dg (la definición vieja, antes de CAMBIO 1). Si en el
  // futuro alguien reintroduce un cruce con proyecto_usuarios/nodo_miembros
  // para "ampliar" el bono por membresía de un tercero, o vuelve a
  // comparar por DG, esta prueba se pone roja.
  test('el bono se resuelve comparando proyectos.id_direccion_area_lider contra usuario.id_direccion_area, nunca por id_dg ni cruzando proyecto_usuarios/nodo_miembros', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_AREA }] });
    await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1', id_direccion_area: 'area-1' });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/id_direccion_area_lider\s*=\s*\$1/);
    expect(sql).not.toMatch(/id_dg_lider/);
    expect(sql).not.toMatch(/proyecto_usuarios/);
    expect(sql).not.toMatch(/nodo_miembros/);
    expect(params).toEqual(['area-1']);
  });

  // El caso que motivó CAMBIO 1: dos direcciones de área DISTINTA bajo la
  // MISMA DG no deben verse los proyectos entre sí — el bono es por área,
  // no por DG, aunque ambas compartan usuario.id_dg.
  test('NO incluye un proyecto de otra área de la MISMA DG', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_AREA }] }); // solo lo que es realmente de su área
    const UUID_DE_OTRA_AREA_MISMA_DG = '00000000-0000-0000-0000-000000000099';
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1', id_direccion_area: 'area-1' });
    expect(resultado).not.toContain(UUID_DE_OTRA_AREA_MISMA_DG);
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_AREA].sort());
  });

  test('direccion SIN id_direccion_area asignada no gana nada de más (null-safe)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1', id_direccion_area: null });
    expect(resultado).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuario — direccion_general, el bono de DG completa (sin cambios en este paso)', () => {
  test('recibe la unión de su participación y los proyectos de TODA su DG', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion_general', id: 'u1', id_dg: 'dg-1' });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });

  test('el bono se resuelve comparando proyectos.id_dg_lider contra usuario.id_dg, nunca por área ni cruzando proyecto_usuarios/nodo_miembros', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });
    await alcanceProyectosUsuario({ rol: 'direccion_general', id: 'u1', id_dg: 'dg-1' });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/id_dg_lider\s*=\s*\$1/);
    expect(sql).not.toMatch(/id_direccion_area_lider/);
    expect(sql).not.toMatch(/proyecto_usuarios/);
    expect(sql).not.toMatch(/nodo_miembros/);
    expect(params).toEqual(['dg-1']);
  });

  test('direccion_general SIN id_dg asignada no gana nada de más (null-safe)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion_general', id: 'u1', id_dg: null });
    expect(resultado).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuario — enlace, sin bono (regresión)', () => {
  test('recibe solo los proyectos donde participa, nunca ningún bono', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuario({ rol: 'enlace', id: 'u1', id_dg: 'dg-1', id_direccion_area: 'area-1' });
    expect(resultado).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuarioONull — delega en alcanceProyectosUsuario para todo lo que no sea superadmin/ejecutivo', () => {
  test.each(['superadmin', 'ejecutivo'])('%s recibe null', async (rol) => {
    const resultado = await alcanceProyectosUsuarioONull({ rol });
    expect(resultado).toBeNull();
  });

  test('direccion recibe la lista CON bono de área (no null)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_AREA }] });
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'direccion', id: 'u1', id_direccion_area: 'area-1' });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_AREA].sort());
  });

  test('enlace recibe la lista SIN bono', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'enlace', id: 'u1' });
    expect(resultado).toEqual([UUID_PROPIO]);
  });
});
