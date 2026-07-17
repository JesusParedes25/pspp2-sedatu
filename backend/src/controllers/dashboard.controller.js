/**
 * ARCHIVO: dashboard.controller.js
 * PROPÓSITO: Endpoint para el dashboard ejecutivo.
 */
const dashboardQueries = require('../db/queries/dashboard.queries');

// GET /dashboard
async function obtenerDashboard(req, res, next) {
  try {
    const filtros = {};
    if (req.query.id_dg) filtros.id_dg = req.query.id_dg;

    const [metricas, avancePorDG, alertas, indicadores] = await Promise.all([
      dashboardQueries.obtenerMetricasGlobales(filtros),
      dashboardQueries.obtenerAvancePorDG(),
      dashboardQueries.obtenerAlertas(filtros),
      dashboardQueries.obtenerIndicadoresPublicables(filtros),
    ]);

    res.json({
      datos: { metricas, avancePorDG, alertas, indicadores },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerDashboard };
