/**
 * ARCHIVO: dashboard.controller.js
 * PROPÓSITO: Endpoint para el dashboard ejecutivo.
 */
const dashboardQueries = require('../db/queries/dashboard.queries');
const { alcanceProyectosUsuarioONull } = require('../utils/alcanceProyectos');

// GET /dashboard — vista personalizada (docs/modelo-permisos.md sección
// 9.1): acotada al alcance real del usuario (participación + bono de DG
// para 'direccion'); superadmin/ejecutivo siguen viendo todo. ?id_dg=
// sigue existiendo como filtro de conveniencia, pero ya no se obedece a
// ciegas — cada query lo intersecta con el alcance real.
async function obtenerDashboard(req, res, next) {
  try {
    const filtros = {};
    if (req.query.id_dg) filtros.id_dg = req.query.id_dg;
    const alcanceProyectoIds = await alcanceProyectosUsuarioONull(req.usuario);

    const [metricas, avancePorDG, alertas, indicadores] = await Promise.all([
      dashboardQueries.obtenerMetricasGlobales(filtros, alcanceProyectoIds),
      dashboardQueries.obtenerAvancePorDG(filtros, alcanceProyectoIds),
      dashboardQueries.obtenerAlertas(filtros, alcanceProyectoIds),
      dashboardQueries.obtenerIndicadoresPublicables(filtros, alcanceProyectoIds),
    ]);

    res.json({
      datos: { metricas, avancePorDG, alertas, indicadores },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerDashboard };
