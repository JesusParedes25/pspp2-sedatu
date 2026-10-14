/**
 * ARCHIVO: paso2-casos-especificos.test.js
 * PROPÓSITO: Fase 2, Paso 2 (docs/modelo-permisos.md sección 9) —
 *            tres casos puntuales pedidos explícitamente:
 *            1) GET /indicadores/mios ("Mis indicadores") hereda el
 *               bono de DG igual que el resto del Grupo 1.
 *            2) GET /agenda (Agenda + pestaña Pendientes de "Mis
 *               actividades") NO hereda el bono — es trabajo propio,
 *               nunca el de los enlaces de la DG de un director.
 *            3) Regresión: GET /proyectos con filtro "Todos" sigue
 *               devolviendo todo para cualquier interno, sin acotar por
 *               participación ni por DG — esa pantalla no es personalizada.
 *
 * Ejecutar: npm test
 */

const fs = require('fs');

describe('GET /indicadores/mios — hereda el bono de DG (Grupo 1)', () => {
  const UUID_PROPIO = '00000000-0000-0000-0000-000000000001';
  const UUID_DG = '00000000-0000-0000-0000-000000000002';

  jest.mock('../db/pool', () => ({ query: jest.fn() }));
  jest.mock('../db/queries/miembros.queries', () => ({ obtenerProyectosUsuario: jest.fn() }));
  jest.mock('../db/queries/carteras.queries', () => ({ obtenerProyectoIdsDeCartera: jest.fn() }));
  jest.mock('../db/queries/inicio.queries', () => ({ obtenerIndicadoresAgregados: jest.fn().mockResolvedValue([{ id: 'ind-1' }]) }));
  jest.mock('../db/queries/indicadores.queries', () => ({}));

  const pool = require('../db/pool');
  const miembrosQueries = require('../db/queries/miembros.queries');
  const inicioQueries = require('../db/queries/inicio.queries');
  const indicadoresController = require('../controllers/indicadores.controller');

  function crearRes() {
    return { json: jest.fn().mockReturnThis() };
  }

  beforeEach(() => jest.clearAllMocks());

  test('direccion recibe también los indicadores de los proyectos de su propia DG, aunque no participe en ellos', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_DG }] });

    const req = { usuario: { rol: 'direccion', id: 'u1', id_dg: 'dg-1' }, query: {} };
    await indicadoresController.listarMios(req, crearRes(), jest.fn());

    const [proyectoIdsPasados] = inicioQueries.obtenerIndicadoresAgregados.mock.calls[0];
    expect(proyectoIdsPasados.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });

  test('enlace solo recibe los indicadores de los proyectos donde participa, sin bono', async () => {
    miembrosQueries.obtenerProyectosUsuario.mockResolvedValueOnce([UUID_PROPIO]);

    const req = { usuario: { rol: 'enlace', id: 'u1' }, query: {} };
    await indicadoresController.listarMios(req, crearRes(), jest.fn());

    const [proyectoIdsPasados] = inicioQueries.obtenerIndicadoresAgregados.mock.calls[0];
    expect(proyectoIdsPasados).toEqual([UUID_PROPIO]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(['superadmin', 'ejecutivo'])('%s recibe todos los indicadores, sin tocar membresía', async (rol) => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: UUID_PROPIO }, { id: UUID_DG }] });

    const req = { usuario: { rol }, query: {} };
    await indicadoresController.listarMios(req, crearRes(), jest.fn());

    expect(miembrosQueries.obtenerProyectosUsuario).not.toHaveBeenCalled();
    const [proyectoIdsPasados] = inicioQueries.obtenerIndicadoresAgregados.mock.calls[0];
    expect(proyectoIdsPasados.sort()).toEqual([UUID_PROPIO, UUID_DG].sort());
  });
});

describe('GET /agenda — NO hereda el bono de DG ni en Agenda ni en "Mis actividades"', () => {
  test('acciones.controller.js (agenda) no importa alcanceProyectos.js — resuelto solo por id de usuario', () => {
    const fuente = fs.readFileSync(require.resolve('../controllers/acciones.controller.js'), 'utf8');
    expect(fuente).not.toMatch(/alcanceProyectos/);
  });

  test('acciones.queries.js (obtenerAccionesAgenda) no filtra por id_dg_lider — es trabajo propio, no de la DG', () => {
    const fuente = fs.readFileSync(require.resolve('../db/queries/acciones.queries.js'), 'utf8');
    expect(fuente).not.toMatch(/id_dg_lider/);
  });

  test('la agenda se resuelve llamando solo con el id del usuario, nunca con su id_dg, sin importar el rol', async () => {
    jest.resetModules();
    jest.doMock('../db/queries/acciones.queries', () => ({ obtenerAccionesAgenda: jest.fn().mockResolvedValue([]) }));
    const accionesQueries = require('../db/queries/acciones.queries');
    const accionesController = require('../controllers/acciones.controller');
    const res = { json: jest.fn().mockReturnThis() };

    for (const rol of ['superadmin', 'ejecutivo', 'direccion', 'enlace']) {
      accionesQueries.obtenerAccionesAgenda.mockClear();
      const req = { usuario: { id: 'u1', rol, id_dg: 'dg-1' } };
      await accionesController.agenda(req, res, jest.fn());
      expect(accionesQueries.obtenerAccionesAgenda).toHaveBeenCalledWith('u1');
      expect(accionesQueries.obtenerAccionesAgenda).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Regresión — Proyectos con filtro "Todos" sigue devolviendo todo para cualquier interno', () => {
  test('proyectos.controller.js (listar) no pasa por alcanceProyectos.js — la visibilidad sigue siendo total', () => {
    const fuente = fs.readFileSync(require.resolve('../controllers/proyectos.controller.js'), 'utf8');
    expect(fuente).not.toMatch(/alcanceProyectos/);
  });

  test('listarProyectos no filtra por participación salvo que se pida explícitamente (?participacion=)', async () => {
    jest.resetModules();
    jest.doMock('../db/queries/proyectos.queries', () => ({
      listarProyectos: jest.fn().mockResolvedValue({ proyectos: [], total: 0 }),
    }));
    const proyectosQueries = require('../db/queries/proyectos.queries');
    const proyectosController = require('../controllers/proyectos.controller');
    const res = { json: jest.fn().mockReturnThis() };

    for (const rol of ['superadmin', 'ejecutivo', 'direccion', 'enlace']) {
      proyectosQueries.listarProyectos.mockClear();
      const req = { usuario: { id: 'u1', rol, id_dg: 'dg-1' }, query: {} };
      await proyectosController.listar(req, res, jest.fn());
      const [argumentos] = proyectosQueries.listarProyectos.mock.calls[0];
      // Sin "participacion" en la query, listarProyectos no recibe ninguna
      // restricción de alcance -- el mismo llamado para los 4 perfiles.
      expect(argumentos.participacion).toBeUndefined();
    }
  });
});
