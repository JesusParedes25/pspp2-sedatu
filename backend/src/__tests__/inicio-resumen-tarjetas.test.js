/**
 * ARCHIVO: inicio-resumen-tarjetas.test.js
 * PROPÓSITO: Pantalla de Inicio (el concentrador) — GET
 *            /inicio/resumen-tarjetas, los conteos de las tarjetas de
 *            acceso. Bloque 1 de "PSPP v2.0 · Inicio, color y la guía de
 *            uso": cada conteo tiene que salir de la MISMA consulta que
 *            alimenta la pantalla destino de su tarjeta, nunca de una
 *            consulta nueva que recalcule "lo mismo" con otro criterio —
 *            por eso este test verifica que el controller llama
 *            exactamente a contarProyectosVisibles, contarProyectosUsuario
 *            (mismo WHERE que el Tablero), contarIndicadoresVisibles, y a
 *            geografiaQueries.obtenerMapaIncidenciaGeo (la MISMA función
 *            que usa el mapa de Territorio, no una tabla distinta) tomando
 *            su .length. "Mis actividades" ya no vive aquí: se calcula en
 *            el frontend sobre GET /agenda con utils/resumenMisActividades.js
 *            (ver Inicio.jsx y resumenMisActividades.test.js).
 *
 * Ejecutar: npm test
 */
jest.mock('../db/queries/inicio.queries', () => ({
  contarProyectosVisibles: jest.fn(),
  contarProyectosUsuario: jest.fn(),
  contarIndicadoresVisibles: jest.fn(),
}));
jest.mock('../db/queries/geografia.queries', () => ({
  obtenerMapaIncidenciaGeo: jest.fn(),
}));
jest.mock('../utils/alcanceProyectos', () => ({
  alcanceProyectosUsuario: jest.fn(),
  resolverProyectoIdsFiltro: jest.fn(),
}));

const inicioQueries = require('../db/queries/inicio.queries');
const geografiaQueries = require('../db/queries/geografia.queries');
const { alcanceProyectosUsuario } = require('../utils/alcanceProyectos');
const { obtenerResumenTarjetas } = require('../controllers/inicio.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /inicio/resumen-tarjetas', () => {
  it('arma los 4 conteos de las tarjetas a partir del alcance del usuario, reusando las mismas consultas que sus pantallas destino', async () => {
    alcanceProyectosUsuario.mockResolvedValue(['p1', 'p2', 'p3']);
    inicioQueries.contarProyectosVisibles.mockResolvedValue(40);
    inicioQueries.contarProyectosUsuario.mockResolvedValue(3);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(12);
    geografiaQueries.obtenerMapaIncidenciaGeo.mockResolvedValue([
      { cve_ent: '06' }, { cve_ent: '14' }, { cve_ent: '09' },
    ]);

    const req = { usuario: { id: 'u1', rol: 'direccion' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerResumenTarjetas(req, res, next);

    expect(alcanceProyectosUsuario).toHaveBeenCalledWith(req.usuario);
    expect(inicioQueries.contarProyectosUsuario).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(inicioQueries.contarIndicadoresVisibles).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(geografiaQueries.obtenerMapaIncidenciaGeo).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      datos: {
        proyectos_visibles: 40,
        proyectos_sigue: 3,
        indicadores_visibles: 12,
        estados_con_actividad: 3,
      },
    });
  });

  it('un usuario sin ningún proyecto en su alcance da proyectos_sigue=0 y estados_con_actividad=0, sin tronar', async () => {
    alcanceProyectosUsuario.mockResolvedValue([]);
    inicioQueries.contarProyectosVisibles.mockResolvedValue(40);
    inicioQueries.contarProyectosUsuario.mockResolvedValue(0);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(0);
    geografiaQueries.obtenerMapaIncidenciaGeo.mockResolvedValue([]);

    const req = { usuario: { id: 'u2', rol: 'externo' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerResumenTarjetas(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      datos: {
        proyectos_visibles: 40,
        proyectos_sigue: 0,
        indicadores_visibles: 0,
        estados_con_actividad: 0,
      },
    });
  });

  it('si una consulta truena, llama a next(err) en vez de responder', async () => {
    alcanceProyectosUsuario.mockResolvedValue(['p1']);
    const error = new Error('fallo de conexión');
    inicioQueries.contarProyectosVisibles.mockRejectedValue(error);
    inicioQueries.contarProyectosUsuario.mockResolvedValue(0);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(0);
    geografiaQueries.obtenerMapaIncidenciaGeo.mockResolvedValue([]);

    const req = { usuario: { id: 'u3', rol: 'enlace' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerResumenTarjetas(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
