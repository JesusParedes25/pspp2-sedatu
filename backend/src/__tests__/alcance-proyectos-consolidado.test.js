/**
 * ARCHIVO: alcance-proyectos-consolidado.test.js
 * PROPÓSITO: Fase 1 del modelo de permisos (docs/modelo-permisos.md,
 *            sección 6.3) — existían tres implementaciones independientes
 *            de "a qué proyectos tiene acceso este usuario" (Tablero,
 *            Evidencias, Territorio) que no coincidían para 'direccion'.
 *            Ahora comparten una sola función,
 *            alcanceProyectosUsuarioONull, en utils/alcanceProyectos.js.
 *
 *            Fase 2 / Paso 2 (sección 9): esa única función gana el
 *            bono de DG para 'direccion' que la Fase 1 había dejado
 *            deliberadamente pendiente — ver alcanceProyectos.test.js
 *            para la cobertura completa de esa regla (unión con
 *            participación, nunca por membresía de terceros, null-safe).
 *            Aquí solo se actualiza el caso puntual que esta suite ya
 *            cubría para que refleje la regla nueva en vez de la vieja.
 *
 * Ejecutar: npm test
 */

const fs = require('fs');

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_2 = '00000000-0000-0000-0000-000000000002';

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../db/queries/miembros.queries', () => ({ obtenerProyectosUsuario: jest.fn() }));

const miembrosQueries = require('../db/queries/miembros.queries');
const { alcanceProyectosUsuarioONull } = require('../utils/alcanceProyectos');

beforeEach(() => {
  mockQuery.mockReset();
  miembrosQueries.obtenerProyectosUsuario.mockReset();
});

describe('alcanceProyectosUsuarioONull', () => {
  test('superadmin recibe null (sin restricción)', async () => {
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'superadmin' });
    expect(resultado).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('ejecutivo recibe null (sin restricción)', async () => {
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'ejecutivo' });
    expect(resultado).toBeNull();
  });

  test('direccion recibe la unión de su participación y los proyectos de su propia DG (Fase 2 / Paso 2)', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_1]);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_2 }] });
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'direccion', id: 'u1', id_dg: 'dg-1' });
    expect(resultado.sort()).toEqual([UUID_1, UUID_2].sort());
  });

  test('enlace recibe solo los proyectos donde participa', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_2]);
    const resultado = await alcanceProyectosUsuarioONull({ rol: 'enlace', id: UUID_1 });
    expect(resultado).toEqual([UUID_2]);
  });
});

describe('geo.controller.js y evidencias.controller.js delegan en el mismo resolver', () => {
  test('geo.controller.js::resolverProyectoIds ya no reimplementa la rama por rol', () => {
    const fuente = fs.readFileSync(
      require.resolve('../controllers/geo.controller.js'), 'utf8'
    );
    expect(fuente).toMatch(/alcanceProyectosUsuarioONull/);
    expect(fuente).not.toMatch(/usuario\.rol === 'superadmin' \|\| usuario\.rol === 'ejecutivo'\) return null/);
  });

  test('evidencias.controller.js ya no filtra por id_dg_lider directo (perdió el bono de DG para direccion)', () => {
    const fuente = fs.readFileSync(
      require.resolve('../controllers/evidencias.controller.js'), 'utf8'
    );
    expect(fuente).toMatch(/alcanceProyectosUsuarioONull/);
    expect(fuente).not.toMatch(/id_dg_lider = \$1/);
  });
});
