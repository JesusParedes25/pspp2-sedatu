/**
 * ARCHIVO: proyectos.stats.controller.js
 * PROPÓSITO: Endpoint de estadísticas/métricas del proyecto para el dashboard de resumen.
 *
 * MINI-CLASE: Endpoint de estadísticas agregadas
 * ─────────────────────────────────────────────────────────────────
 * GET /proyectos/:id/stats devuelve en una sola llamada todas las
 * métricas que necesita el dashboard de resumen:
 * - Conteo de acciones por estado
 * - Total de evidencias del proyecto
 * - Riesgos activos (con flag de criticidad)
 * - Actividad reciente (comentarios + evidencias)
 * - Acciones con sus subacciones para el mosaico
 * Se ejecutan en paralelo con Promise.all para eficiencia.
 * ─────────────────────────────────────────────────────────────────
 */
const statsQueries = require('../db/queries/proyectos.stats.queries');

// GET /proyectos/:id/stats
async function obtenerStats(req, res, next) {
  try {
    const proyectoId = req.params.id;

    // Ejecutar todas las queries en paralelo
    const [acciones, evidencias, riesgos, actividad, accionesResumen, atrasadas, proximasAVencer, riesgosDetalle] = await Promise.all([
      statsQueries.contarAccionesPorEstado(proyectoId),
      statsQueries.contarEvidenciasProyecto(proyectoId),
      statsQueries.contarRiesgosActivos(proyectoId),
      statsQueries.obtenerActividadReciente(proyectoId),
      statsQueries.obtenerAccionesResumen(proyectoId),
      statsQueries.obtenerAtrasadas(proyectoId),
      statsQueries.obtenerProximasAVencer(proyectoId),
      statsQueries.obtenerRiesgosDetalle(proyectoId),
    ]);

    res.json({
      datos: {
        acciones,
        evidencias: { total: evidencias },
        riesgos,
        actividad,
        acciones_resumen: accionesResumen,
        atrasadas,
        proximas_a_vencer: proximasAVencer,
        riesgos_detalle: riesgosDetalle,
      },
      mensaje: 'Estadísticas del proyecto obtenidas',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerStats };
