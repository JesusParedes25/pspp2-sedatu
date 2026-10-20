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
    const [acciones, evidencias, riesgos, actividad, accionesResumen, atrasadas, proximasAVencer, riesgosDetalle, indicadores] = await Promise.all([
      statsQueries.contarAccionesPorEstado(proyectoId),
      statsQueries.contarEvidenciasProyecto(proyectoId),
      statsQueries.contarRiesgosActivos(proyectoId),
      statsQueries.obtenerActividadReciente(proyectoId),
      statsQueries.obtenerAccionesResumen(proyectoId),
      statsQueries.obtenerAtrasadas(proyectoId),
      statsQueries.obtenerProximasAVencer(proyectoId),
      statsQueries.obtenerRiesgosDetalle(proyectoId),
      statsQueries.obtenerIndicadoresConProgreso(proyectoId),
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
        indicadores,
      },
      mensaje: 'Estadísticas del proyecto obtenidas',
    });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/actividades-sin-fecha
// Bloque 3.2 (navegación del árbol): lo que el Cronograma no puede
// dibujar por falta de fecha, para avisarlo en vez de omitirlo en
// silencio. Endpoint propio (no se agregó a /stats, que es del dashboard
// de resumen y no lo consume ninguna pantalla de Seguimiento) porque
// GanttCronograma.jsx es autosuficiente: ya hace su propia carga bajo
// demanda, no depende del contexto de la página que lo monta.
async function obtenerActividadesSinFecha(req, res, next) {
  try {
    const items = await statsQueries.obtenerActividadesSinFecha(req.params.id);
    res.json({ datos: { total: items.length, items }, mensaje: 'Actividades sin fecha obtenidas' });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerStats, obtenerActividadesSinFecha };
