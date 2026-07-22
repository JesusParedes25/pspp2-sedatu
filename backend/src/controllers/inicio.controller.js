/**
 * ARCHIVO: inicio.controller.js
 * PROPÓSITO: Endpoint GET /inicio — dashboard personalizado del usuario.
 */
const inicioQueries = require('../db/queries/inicio.queries');
const miembrosQueries = require('../db/queries/miembros.queries');
const pool = require('../db/pool');

// GET /inicio
async function obtenerInicio(req, res, next) {
  try {
    const usuario = req.usuario;

    // Determine project IDs the user has access to
    let proyectoIds = null;
    if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') {
      // Fetch all active project IDs
      const { rows } = await pool.query(
        "SELECT id FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelado'"
      );
      proyectoIds = rows.map(r => r.id);
    } else {
      proyectoIds = await miembrosQueries.obtenerProyectosUsuario(usuario.id);
    }

    if (!proyectoIds || proyectoIds.length === 0) {
      return res.json({
        datos: {
          proyectos: [],
          vencidos: [],
          por_vencer: [],
          riesgos: [],
          mapa_incidencia: [],
          indicadores: [],
          actividad: []
        }
      });
    }

    const [proyectos, vencidos, porVencer, riesgos, mapaIncidencia, indicadores, actividad] = await Promise.all([
      inicioQueries.obtenerProyectosUsuario(proyectoIds),
      inicioQueries.obtenerVencidos(proyectoIds),
      inicioQueries.obtenerPorVencer(proyectoIds),
      inicioQueries.obtenerRiesgosAbiertos(proyectoIds),
      inicioQueries.obtenerMapaIncidencia(proyectoIds),
      inicioQueries.obtenerIndicadoresAgregados(proyectoIds),
      inicioQueries.obtenerActividadReciente(proyectoIds),
    ]);

    res.json({
      datos: {
        proyectos,
        vencidos,
        por_vencer: porVencer,
        riesgos,
        mapa_incidencia: mapaIncidencia,
        indicadores,
        actividad
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerInicio };
