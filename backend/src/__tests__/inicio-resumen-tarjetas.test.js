/**
 * ARCHIVO: inicio-resumen-tarjetas.test.js
 * PROPÓSITO: Pantalla de Inicio (el concentrador, bloque 3) — GET
 *            /inicio/resumen-tarjetas, los conteos de las tarjetas de
 *            acceso. Las 4 consultas en sí (contarProyectosVisibles,
 *            contarIndicadoresVisibles, contarEstadosConActividad,
 *            obtenerResumenMisActividades) se validaron aparte contra una
 *            instancia real de Postgres 16 con datos de prueba: 2
 *            proyectos activos + 1 cancelado + 1 borrado (el conteo total
 *            dio 2), un usuario con una etapa vencida, una acción propia
 *            sin vencer, una acción asignada solo por nodo_miembros, una
 *            tarea completada (excluida) y una tarea vencida — dio
 *            total=4/vencidas=2 exactamente como se esperaba — y una
 *            acción con el mismo responsable pero en un proyecto
 *            Cancelada, que quedó correctamente fuera. Este test (con
 *            inicioQueries y alcanceProyectosUsuario mockeados) cubre que
 *            el controller arma la respuesta con esos 4 resultados en las
 *            claves correctas.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/queries/inicio.queries', () => ({
  contarProyectosVisibles: jest.fn(),
  contarIndicadoresVisibles: jest.fn(),
  contarEstadosConActividad: jest.fn(),
  obtenerResumenMisActividades: jest.fn(),
}));
jest.mock('../utils/alcanceProyectos', () => ({
  alcanceProyectosUsuario: jest.fn(),
  resolverProyectoIdsFiltro: jest.fn(),
}));

const inicioQueries = require('../db/queries/inicio.queries');
const { alcanceProyectosUsuario } = require('../utils/alcanceProyectos');
const { obtenerResumenTarjetas } = require('../controllers/inicio.controller');

function crearRes() {
  return { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /inicio/resumen-tarjetas', () => {
  it('arma los 6 conteos de las tarjetas a partir del alcance del usuario', async () => {
    alcanceProyectosUsuario.mockResolvedValue(['p1', 'p2', 'p3']);
    inicioQueries.contarProyectosVisibles.mockResolvedValue(40);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(12);
    inicioQueries.contarEstadosConActividad.mockResolvedValue(9);
    inicioQueries.obtenerResumenMisActividades.mockResolvedValue({ total: 4, vencidas: 2 });

    const req = { usuario: { id: 'u1', rol: 'direccion' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerResumenTarjetas(req, res, next);

    expect(alcanceProyectosUsuario).toHaveBeenCalledWith(req.usuario);
    expect(inicioQueries.contarIndicadoresVisibles).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(inicioQueries.contarEstadosConActividad).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(inicioQueries.obtenerResumenMisActividades).toHaveBeenCalledWith('u1');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      datos: {
        proyectos_visibles: 40,
        proyectos_sigue: 3,
        indicadores_visibles: 12,
        estados_con_actividad: 9,
        mis_actividades_total: 4,
        mis_actividades_vencidas: 2,
      },
    });
  });

  it('un usuario sin ningún proyecto en su alcance da proyectos_sigue=0, sin tronar', async () => {
    alcanceProyectosUsuario.mockResolvedValue([]);
    inicioQueries.contarProyectosVisibles.mockResolvedValue(40);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(0);
    inicioQueries.contarEstadosConActividad.mockResolvedValue(0);
    inicioQueries.obtenerResumenMisActividades.mockResolvedValue({ total: 0, vencidas: 0 });

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
        mis_actividades_total: 0,
        mis_actividades_vencidas: 0,
      },
    });
  });

  it('si una consulta truena, llama a next(err) en vez de responder', async () => {
    alcanceProyectosUsuario.mockResolvedValue(['p1']);
    const error = new Error('fallo de conexión');
    inicioQueries.contarProyectosVisibles.mockRejectedValue(error);
    inicioQueries.contarIndicadoresVisibles.mockResolvedValue(0);
    inicioQueries.contarEstadosConActividad.mockResolvedValue(0);
    inicioQueries.obtenerResumenMisActividades.mockResolvedValue({ total: 0, vencidas: 0 });

    const req = { usuario: { id: 'u3', rol: 'enlace' } };
    const res = crearRes();
    const next = jest.fn();

    await obtenerResumenTarjetas(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
