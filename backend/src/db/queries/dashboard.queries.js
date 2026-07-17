/**
 * ARCHIVO: dashboard.queries.js
 * PROPÓSITO: Queries agregadas para el dashboard ejecutivo.
 */
const pool = require('../pool');

/**
 * Métricas globales: total proyectos, acciones, avance, estados activos.
 */
async function obtenerMetricasGlobales(filtros = {}) {
  const params = [];
  let filtroDG = '';
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    filtroDG = `AND p.id_dg_lider = $${params.length}`;
  }

  const { rows: [metricas] } = await pool.query(`
    SELECT
      COUNT(DISTINCT p.id)::int AS total_proyectos,
      COUNT(DISTINCT CASE WHEN p.estado = 'En_proceso' THEN p.id END)::int AS proyectos_activos,
      COUNT(a.id)::int AS total_acciones,
      COUNT(a.id) FILTER (WHERE a.estado = 'En_proceso')::int AS acciones_en_proceso,
      COUNT(a.id) FILTER (WHERE a.estado = 'Completada')::int AS acciones_completadas,
      COUNT(a.id) FILTER (WHERE a.estado = 'Bloqueada')::int AS acciones_bloqueadas,
      COUNT(DISTINCT cg.id_estado)::int AS estados_activos
    FROM proyectos p
    LEFT JOIN acciones a ON a.id_proyecto = p.id AND a.id_accion_padre IS NULL AND a.estado != 'Cancelada'
    LEFT JOIN cobertura_geografica cg ON cg.tipo_entidad = 'accion' AND cg.id_entidad = a.id
    WHERE p.estado != 'Cancelado' ${filtroDG}
  `, params);

  const totalNoCancel = (metricas.total_acciones || 1);
  metricas.avance_global = Math.round(((metricas.acciones_completadas || 0) / totalNoCancel) * 100);
  return metricas;
}

/**
 * Avance por DG: para barras horizontales del dashboard.
 */
async function obtenerAvancePorDG() {
  const { rows } = await pool.query(`
    SELECT
      dg.id, dg.siglas, dg.nombre,
      COUNT(DISTINCT p.id)::int AS proyectos,
      COUNT(a.id)::int AS total_acciones,
      COUNT(a.id) FILTER (WHERE a.estado = 'Completada')::int AS completadas
    FROM direcciones_generales dg
    JOIN proyectos p ON p.id_dg_lider = dg.id AND p.estado != 'Cancelado'
    LEFT JOIN acciones a ON a.id_proyecto = p.id AND a.id_accion_padre IS NULL AND a.estado != 'Cancelada'
    GROUP BY dg.id, dg.siglas, dg.nombre
    HAVING COUNT(a.id) > 0
    ORDER BY dg.siglas
  `);

  return rows.map(r => ({
    ...r,
    avance_pct: r.total_acciones > 0 ? Math.round((r.completadas / r.total_acciones) * 100) : 0,
  }));
}

/**
 * Alertas: acciones vencidas, riesgos críticos, DGs inactivas.
 */
async function obtenerAlertas(filtros = {}) {
  const params = [];
  let filtroDG = '';
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    filtroDG = `AND p.id_dg_lider = $${params.length}`;
  }

  // Acciones vencidas
  const { rows: vencidas } = await pool.query(`
    SELECT a.id, a.nombre, a.fecha_fin, p.nombre AS proyecto_nombre,
      EXTRACT(DAY FROM NOW() - a.fecha_fin)::int AS dias_atraso
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto
    WHERE a.fecha_fin < NOW() AND a.estado NOT IN ('Completada','Cancelada')
      AND a.id_accion_padre IS NULL ${filtroDG}
    ORDER BY a.fecha_fin ASC LIMIT 10
  `, params);

  // Riesgos críticos
  const { rows: riesgos } = await pool.query(`
    SELECT r.titulo, r.nivel, r.created_at, p.nombre AS proyecto_nombre
    FROM riesgos r
    JOIN proyectos p ON r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id
    WHERE r.estado IN ('Abierto','En_mitigacion') AND r.nivel IN ('Critico','Alto')
      ${filtroDG ? `AND p.id_dg_lider = $1` : ''}
    ORDER BY CASE r.nivel WHEN 'Critico' THEN 1 ELSE 2 END, r.created_at DESC
    LIMIT 5
  `, params);

  return { vencidas, riesgos };
}

/**
 * Indicadores publicables con progreso (para sección del dashboard).
 */
async function obtenerIndicadoresPublicables(filtros = {}) {
  const params = [];
  let filtroDG = '';
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    filtroDG = `AND p.id_dg_lider = $${params.length}`;
  }

  const { rows } = await pool.query(`
    SELECT i.id, i.nombre, i.meta_global, i.valor_actual, i.unidad, i.unidad_personalizada,
      p.nombre AS proyecto_nombre, dg.siglas AS dg_siglas
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE i.es_publicable = true AND i.activo = true ${filtroDG}
    ORDER BY dg.siglas, p.nombre
  `, params);

  return rows.map(r => ({
    ...r,
    meta_global: parseFloat(r.meta_global) || 0,
    valor_actual: parseFloat(r.valor_actual) || 0,
    avance_pct: (parseFloat(r.meta_global) || 0) > 0
      ? Math.round(((parseFloat(r.valor_actual) || 0) / parseFloat(r.meta_global)) * 100) : 0,
  }));
}

module.exports = {
  obtenerMetricasGlobales,
  obtenerAvancePorDG,
  obtenerAlertas,
  obtenerIndicadoresPublicables,
};
