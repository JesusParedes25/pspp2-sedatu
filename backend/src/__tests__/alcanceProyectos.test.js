/**
 * ARCHIVO: alcanceProyectos.test.js
 * PROPÓSITO: Fase 2, Paso 2 del modelo de permisos (docs/modelo-permisos.md
 *            sección 9) — el bono de DG para 'direccion' en
 *            alcanceProyectosUsuario/alcanceProyectosUsuarioONull.
 *            Definición exacta a proteger: unión de (1) los proyectos
 *            donde el usuario participa y (2) los proyectos cuya
 *            id_dg_lider es la propia DG del usuario — nada más. El
 *            bono se resuelve comparando proyectos.id_dg_lider contra
 *            usuario.id_dg directamente, nunca cruzando
 *            proyecto_usuarios/nodo_miembros de terceros.
 *
 * Ejecutar: npm test
 */

const UUID_PROPIO = '00000000-0000-0000-0000-000000000001'; // participación directa
const UUID_DG = '00000000-0000-0000-0000-000000000002'; // de su propia DG, sin participar

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

describe('alcanceProyectosUsuario — direccion, el bono de DG', () => {
  test('recibe la unión de su participación y los proyectos de su propia DG', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });

  test('sin duplicar si un proyecto está en ambos conjuntos (participa Y es de su DG)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PROPIO }] });
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });
    expect(resultado).toEqual([UUID_PROPIO]);
  });

  // Fija la definición exacta del bono: se resuelve SOLO comparando
  // proyectos.id_dg_lider contra usuario.id_dg. Si en el futuro alguien
  // reintroduce un cruce con proyecto_usuarios/nodo_miembros para
  // "ampliar" el bono por membresía de un tercero, esta prueba se pone
  // roja.
  test('el bono se resuelve comparando proyectos.id_dg_lider contra usuario.id_dg, nunca cruzando proyecto_usuarios/nodo_miembros', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });
    await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/id_dg_lider\s*=\s*\$1/);
    expect(sql).not.toMatch(/proyecto_usuarios/);
    expect(sql).not.toMatch(/nodo_miembros/);
    expect(params).toEqual(['dg-1']);
  });

  // Caso concreto que el usuario descartó explícitamente: un colega de su
  // misma DG participa en un proyecto de OTRA DG. Ese proyecto nunca debe
  // aparecer -- ni por la vía de participación (el propio usuario no
  // participa) ni por la vía de DG (no es id_dg_lider = su DG).
  test('NO incluye un proyecto de otra DG por el solo hecho de que un tercero de su misma DG participe ahí', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] }); // solo lo que es realmente de su DG
    const UUID_DE_OTRA_DG_CON_TERCERO = '00000000-0000-0000-0000-000000000099';
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });
    expect(resultado).not.toContain(UUID_DE_OTRA_DG_CON_TERCERO);
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });

  test('direccion SIN id_dg asignada no gana nada de más (null-safe)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuario({ rol: 'direccion', id: 'u1', id_dg: null });
    expect(resultado).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuario — enlace, sin bono (regresión)', () => {
  test('recibe solo los proyectos donde participa, nunca el bono de DG', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuario({ rol: 'enlace', id: 'u1', id_dg: 'dg-1' });
    expect(resultado).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('alcanceProyectosUsuarioONull — delega en alcanceProyectosUsuario para todo lo que no sea superadmin/ejecutivo', () => {
  test.each(['superadmin', 'ejecutivo'])('%s recibe null', async (rol) => {
    const resultado = await alcanceProyectosUsuarioONull({ rol });
    expect(resultado).toBeNull();
  });

  test('direccion recibe la lista CON bono (no null)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });
    expect(resultado.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });

  test('enlace recibe la lista SIN bono', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'enlace', id: 'u1' });
    expect(resultado).toEqual([UUID_PROPIO]);
  });
});
