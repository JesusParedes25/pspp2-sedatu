/**
 * ARCHIVO: inicio.queries.js
 * PROPÓSITO: Queries para el dashboard personalizado del usuario (/inicio).
 * Todas las consultas se filtran por los proyectos donde el usuario participa.
 */
const pool = require('../pool');

/**
 * Obtiene los proyectos del usuario (donde es miembro o creador).
 * Para superadmin/Ejecutivo se pasan todos los IDs o null para sin filtro.
 */
async function obtenerProyectosUsuario(proyectoIds) {
  const filtro = proyectoIds
    ? `AND p.id = ANY($1)`
    : '';
  const params = proyectoIds ? [proyectoIds] : [];

  const { rows } = await pool.query(`
    SELECT
      p.id, p.nombre, p.estado, p.tipo, p.porcentaje_calculado,
      p.fecha_inicio, p.fecha_limite, p.es_prioritario,
      dg.siglas AS dg_siglas, dg.nombre AS dg_nombre,
      (SELECT COUNT(*) FROM acciones a WHERE a.id_proyecto = p.id AND a.id_accion_padre IS NULL AND a.estado NOT IN ('Completada','Cancelada'))::int AS acciones_pendientes,
      (SELECT COUNT(*) FROM riesgos r WHERE r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion'))::int AS riesgos_activos
    FROM proyectos p
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE p.deleted_at IS NULL AND p.estado != 'Cancelado' ${filtro}
    ORDER BY p.es_prioritario DESC, p.updated_at DESC
    LIMIT 50
  `, params);
  return rows;
}

/**
 * Acciones y tareas vencidas del usuario (fecha_fin < hoy, no completadas).
 */
async function obtenerVencidos(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      a.id, a.nombre, a.estado, a.fecha_fin, a.id_accion_padre,
      EXTRACT(DAY FROM NOW() - a.fecha_fin)::int AS dias_atraso,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre,
      e.nombre AS etapa_nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto
    LEFT JOIN etapas e ON e.id = a.id_etapa
    WHERE a.id_proyecto = ANY($1)
      AND a.fecha_fin < NOW()
      AND a.estado NOT IN ('Completada', 'Cancelada')
    ORDER BY a.fecha_fin ASC
    LIMIT 20
  `, [proyectoIds]);
  return rows;
}

/**
 * Acciones próximas a vencer (en los próximos 14 días).
 */
async function obtenerPorVencer(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      a.id, a.nombre, a.estado, a.fecha_fin, a.id_accion_padre,
      EXTRACT(DAY FROM a.fecha_fin - NOW())::int AS dias_restantes,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre,
      e.nombre AS etapa_nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto
    LEFT JOIN etapas e ON e.id = a.id_etapa
    WHERE a.id_proyecto = ANY($1)
      AND a.fecha_fin >= NOW()
      AND a.fecha_fin <= NOW() + INTERVAL '14 days'
      AND a.estado NOT IN ('Completada', 'Cancelada')
    ORDER BY a.fecha_fin ASC
    LIMIT 20
  `, [proyectoIds]);
  return rows;
}

/**
 * Riesgos abiertos del usuario, agrupados por proyecto.
 */
async function obtenerRiesgosAbiertos(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      r.id, r.titulo, r.nivel, r.estado AS estado_riesgo, r.entidad_tipo, r.created_at,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre
    FROM riesgos r
    JOIN proyectos p ON r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id
    WHERE r.estado IN ('Abierto','En_mitigacion')
      AND p.id = ANY($1)
    UNION ALL
    SELECT
      r.id, r.titulo, r.nivel, r.estado AS estado_riesgo, r.entidad_tipo, r.created_at,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre
    FROM riesgos r
    JOIN etapas et ON r.entidad_tipo = 'Etapa' AND r.entidad_id = et.id
    JOIN proyectos p ON p.id = et.id_proyecto
    WHERE r.estado IN ('Abierto','En_mitigacion')
      AND p.id = ANY($1)
    UNION ALL
    SELECT
      r.id, r.titulo, r.nivel, r.estado AS estado_riesgo, r.entidad_tipo, r.created_at,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre
    FROM riesgos r
    JOIN acciones ac ON r.entidad_tipo IN ('Accion','Subaccion') AND r.entidad_id = ac.id
    JOIN proyectos p ON p.id = ac.id_proyecto
    WHERE r.estado IN ('Abierto','En_mitigacion')
      AND p.id = ANY($1)
    ORDER BY nivel, created_at DESC
    LIMIT 15
  `, [proyectoIds]);
  return rows;
}

/**
 * Mapa de incidencia territorial: por estado, cuántos proyectos tienen cobertura.
 */
async function obtenerMapaIncidencia(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      ef.id, ef.clave AS cve_ent, ef.nombre AS estado_nombre,
      COUNT(DISTINCT cg.id_entidad)::int AS num_proyectos,
      array_agg(DISTINCT p.nombre) AS proyectos_nombres
    FROM cobertura_geografica cg
    JOIN cat_entidades_federativas ef ON ef.id = cg.id_estado
    JOIN proyectos p ON p.id = cg.id_entidad AND cg.tipo_entidad = 'proyecto'
    WHERE p.id = ANY($1) AND p.deleted_at IS NULL
    GROUP BY ef.id, ef.clave, ef.nombre
    ORDER BY num_proyectos DESC
  `, [proyectoIds]);
  return rows;
}

/**
 * Indicadores agregados del usuario, agrupados por tipo.
 */
async function obtenerIndicadoresAgregados(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      i.id, i.nombre, i.tipo, i.unidad, i.unidad_personalizada,
      i.meta_global, i.valor_actual, i.modo_calculo,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre,
      dg.siglas AS dg_siglas
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE i.activo = true AND i.id_proyecto = ANY($1)
    ORDER BY i.tipo, p.nombre, i.nombre
  `, [proyectoIds]);

  return rows.map(r => ({
    ...r,
    meta_global: parseFloat(r.meta_global) || 0,
    valor_actual: parseFloat(r.valor_actual) || 0,
    pct_avance: (parseFloat(r.meta_global) || 0) > 0
      ? Math.min(100, Math.round(((parseFloat(r.valor_actual) || 0) / parseFloat(r.meta_global)) * 100))
      : null
  }));
}

/**
 * Actividad reciente de los proyectos del usuario (últimos 30 eventos).
 */
async function obtenerActividadReciente(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT
      al.id,
      al.tipo,
      al.titulo,
      al.descripcion,
      al.entidad_tipo,
      al.entidad_id,
      al.metadata,
      al.created_at,
      al.id_proyecto AS proyecto_id,
      p.nombre AS proyecto_nombre,
      u.nombre_completo AS actor,
      u.id AS actor_id
    FROM actividad_log al
    JOIN proyectos p ON p.id = al.id_proyecto
    LEFT JOIN usuarios u ON u.id = al.id_usuario
    WHERE al.id_proyecto = ANY($1)
    ORDER BY al.created_at DESC
    LIMIT 50
  `, [proyectoIds]);
  return rows;
}

module.exports = {
  obtenerProyectosUsuario,
  obtenerVencidos,
  obtenerPorVencer,
  obtenerRiesgosAbiertos,
  obtenerMapaIncidencia,
  obtenerIndicadoresAgregados,
  obtenerActividadReciente
};
