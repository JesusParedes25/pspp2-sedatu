/**
 * ARCHIVO: proyectos.stats.queries.js
 * PROPÓSITO: Queries de estadísticas/métricas para el resumen del proyecto.
 *
 * MINI-CLASE: Estadísticas agregadas del proyecto
 * ─────────────────────────────────────────────────────────────────
 * Estas queries calculan métricas en la BD (no en JS) usando COUNT
 * con GROUP BY para eficiencia. Se usan en el endpoint de resumen
 * del proyecto para alimentar las tarjetas de métricas del dashboard.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

/**
 * Obtiene conteo de acciones por estado para un proyecto.
 * Solo acciones raíz (no subacciones, es decir id_accion_padre IS NULL).
 */
async function contarAccionesPorEstado(proyectoId) {
  const resultado = await pool.query(`
    SELECT estado, COUNT(*)::int AS total
    FROM acciones
    WHERE id_proyecto = $1
      AND id_accion_padre IS NULL
    GROUP BY estado
    ORDER BY estado
  `, [proyectoId]);

  // Construir objeto con todos los estados posibles
  const mapa = {
    Pendiente: 0,
    En_proceso: 0,
    Completada: 0,
    Bloqueada: 0,
    Cancelada: 0,
  };
  let totalGeneral = 0;
  for (const row of resultado.rows) {
    mapa[row.estado] = row.total;
    totalGeneral += row.total;
  }
  return { por_estado: mapa, total: totalGeneral };
}

/**
 * Cuenta el total de evidencias del proyecto:
 * - Evidencias de acciones del proyecto
 * - Evidencias de subacciones del proyecto
 */
async function contarEvidenciasProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM evidencias e
    WHERE
      e.id_accion IN (
        SELECT id FROM acciones
        WHERE id_proyecto = $1 AND id_accion_padre IS NULL
      )
      OR
      e.id_subaccion IN (
        SELECT id FROM acciones
        WHERE id_proyecto = $1 AND id_accion_padre IS NOT NULL
      )
  `, [proyectoId]);
  return resultado.rows[0]?.total || 0;
}

/**
 * Cuenta riesgos activos (Abierto o En_mitigacion) del proyecto.
 * Incluye flag si hay alguno de nivel Alto o Critico.
 */
async function contarRiesgosActivos(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE nivel IN ('Alto','Critico'))::int AS criticos
    FROM riesgos
    WHERE entidad_tipo = 'Proyecto'
      AND entidad_id = $1
      AND estado IN ('Abierto','En_mitigacion')
  `, [proyectoId]);
  return resultado.rows[0] || { total: 0, criticos: 0 };
}

/**
 * Obtiene actividad reciente del proyecto:
 * - Últimos comentarios en entidades del proyecto
 * - Últimas evidencias subidas
 * Devuelve los 10 eventos más recientes combinados.
 */
async function obtenerActividadReciente(proyectoId) {
  const resultado = await pool.query(`
    (
      SELECT
        'comentario' AS tipo,
        c.created_at,
        u.nombre_completo AS actor,
        dg.siglas AS actor_dg,
        c.contenido AS descripcion,
        c.entidad_tipo,
        c.entidad_id
      FROM comentarios c
      LEFT JOIN usuarios u ON u.id = c.id_autor
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      WHERE
        (c.entidad_tipo = 'Proyecto' AND c.entidad_id = $1)
        OR c.entidad_id IN (
          SELECT id FROM etapas WHERE id_proyecto = $1
          UNION
          SELECT id FROM acciones WHERE id_proyecto = $1
        )
      ORDER BY c.created_at DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        'evidencia' AS tipo,
        e.created_at,
        u.nombre_completo AS actor,
        dg.siglas AS actor_dg,
        e.nombre_original AS descripcion,
        'Evidencia' AS entidad_tipo,
        e.id AS entidad_id
      FROM evidencias e
      LEFT JOIN usuarios u ON u.id = e.id_autor
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      WHERE
        e.id_accion IN (
          SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NULL
        )
        OR e.id_subaccion IN (
          SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NOT NULL
        )
      ORDER BY e.created_at DESC
      LIMIT 5
    )
    ORDER BY created_at DESC
    LIMIT 10
  `, [proyectoId]);
  return resultado.rows;
}

/**
 * Obtiene todas las acciones raíz del proyecto con sus subacciones
 * para el mosaico de acciones del resumen.
 * Incluye id_etapa para poder agruparlas por etapa en el frontend.
 */
async function obtenerAccionesResumen(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      a.id,
      a.nombre,
      a.estado,
      a.porcentaje_avance,
      a.fecha_inicio,
      a.fecha_fin,
      a.motivo_bloqueo,
      a.tipo,
      a.id_etapa,
      -- Quitamos a.orden de aquí arriba
      COALESCE(
        json_agg(
          json_build_object(
            'id', s.id,
            'estado', s.estado,
            'nombre', s.nombre,
            'fecha_fin', s.fecha_fin
          ) ORDER BY s.created_at -- Quitamos s.orden de aquí
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS subacciones
    FROM acciones a
    LEFT JOIN acciones s ON s.id_accion_padre = a.id AND s.estado != 'Cancelada'
    WHERE a.id_proyecto = $1
      AND a.id_accion_padre IS NULL
      AND a.estado != 'Cancelada'
    GROUP BY a.id
    ORDER BY a.id_etapa NULLS LAST, a.fecha_fin ASC 
  `, [proyectoId]);
  return resultado.rows;
}

/**
 * Obtiene acciones y subacciones atrasadas (fecha_fin < hoy, no completadas).
 */
async function obtenerAtrasadas(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      a.id,
      a.nombre,
      a.estado,
      a.fecha_fin,
      a.id_accion_padre,
      EXTRACT(DAY FROM NOW() - a.fecha_fin)::int AS dias_atraso
    FROM acciones a
    WHERE a.id_proyecto = $1
      AND a.fecha_fin < NOW()
      AND a.estado NOT IN ('Completada', 'Cancelada')
    ORDER BY a.fecha_fin ASC
    LIMIT 10
  `, [proyectoId]);
  return resultado.rows;
}

/**
 * Obtiene acciones próximas a vencer (fecha_fin en los próximos 14 días).
 */
async function obtenerProximasAVencer(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      a.id,
      a.nombre,
      a.estado,
      a.fecha_fin,
      a.id_accion_padre,
      EXTRACT(DAY FROM a.fecha_fin - NOW())::int AS dias_restantes
    FROM acciones a
    WHERE a.id_proyecto = $1
      AND a.fecha_fin >= NOW()
      AND a.fecha_fin <= NOW() + INTERVAL '14 days'
      AND a.estado NOT IN ('Completada', 'Cancelada')
    ORDER BY a.fecha_fin ASC
    LIMIT 10
  `, [proyectoId]);
  return resultado.rows;
}

/**
 * Obtiene detalle de riesgos activos del proyecto.
 */
async function obtenerRiesgosDetalle(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      r.id,
      r.titulo,
      r.nivel,
      r.estado,
      r.descripcion
    FROM riesgos r
    WHERE r.entidad_tipo = 'Proyecto'
      AND r.entidad_id = $1
      AND r.estado IN ('Abierto','En_mitigacion')
    ORDER BY
      CASE r.nivel
        WHEN 'Critico' THEN 1
        WHEN 'Alto' THEN 2
        WHEN 'Medio' THEN 3
        ELSE 4
      END,
      r.created_at DESC
    LIMIT 10
  `, [proyectoId]);
  return resultado.rows;
}

module.exports = {
  contarAccionesPorEstado,
  contarEvidenciasProyecto,
  contarRiesgosActivos,
  obtenerActividadReciente,
  obtenerAccionesResumen,
  obtenerAtrasadas,
  obtenerProximasAVencer,
  obtenerRiesgosDetalle,
};
