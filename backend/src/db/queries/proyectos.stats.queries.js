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
    WHERE estado IN ('Abierto','En_mitigacion')
      AND (
        (entidad_tipo = 'Proyecto'  AND entidad_id = $1)
        OR (entidad_tipo = 'Etapa'     AND entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = $1))
        OR (entidad_tipo = 'Accion'    AND entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NULL))
        OR (entidad_tipo = 'Subaccion' AND entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NOT NULL))
      )
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
      COALESCE(bl.motivo, a.motivo_bloqueo) AS motivo_bloqueo,
      a.tipo,
      a.id_etapa,
      u.nombre_completo AS responsable_nombre,
      (SELECT COUNT(*) FROM comentarios c WHERE c.entidad_id = a.id AND c.entidad_tipo = 'Accion') AS total_comentarios,
      (SELECT COUNT(*) FROM evidencias ev WHERE ev.id_accion = a.id) AS total_evidencias,
      COALESCE(
        json_agg(
          json_build_object(
            'id', s.id,
            'estado', s.estado,
            'nombre', s.nombre,
            'fecha_fin', s.fecha_fin,
            'porcentaje_avance', s.porcentaje_avance
          ) ORDER BY s.created_at
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS subacciones
    FROM acciones a
    LEFT JOIN acciones s ON s.id_accion_padre = a.id AND s.estado != 'Cancelada'
    LEFT JOIN usuarios u ON u.id = a.id_responsable
    LEFT JOIN LATERAL (
      SELECT motivo FROM bloqueos
      WHERE entidad_tipo IN ('Accion','Subaccion')
        AND entidad_id = a.id
        AND fecha_desbloqueo IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) bl ON true
    WHERE a.id_proyecto = $1
      AND a.id_accion_padre IS NULL
      AND a.estado != 'Cancelada'
    GROUP BY a.id, u.nombre_completo, bl.motivo
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
 * Obtiene los indicadores del proyecto (nivel proyecto y nivel etapa)
 * con su meta global, total aportado, % de avance, y desglose de
 * aportaciones por acción/subacción (nombre, tipo, etapa, valor_aportado).
 */
async function obtenerIndicadoresConProgreso(proyectoId) {
  const resIndicadores = await pool.query(`
    SELECT
      i.id,
      i.nombre,
      i.unidad,
      i.unidad_personalizada,
      i.meta_global,
      i.descripcion,
      CASE WHEN i.id_etapa IS NOT NULL THEN 'etapa' ELSE 'proyecto' END AS nivel,
      e.nombre AS etapa_nombre,
      COALESCE(SUM(ai.valor_aportado), 0)::numeric AS total_aportado,
      COUNT(ai.id)::int AS num_acciones
    FROM indicadores i
    LEFT JOIN etapas e ON e.id = i.id_etapa
    LEFT JOIN accion_indicador ai ON ai.id_indicador = i.id
    WHERE i.id_proyecto = $1
    GROUP BY i.id, e.nombre
    ORDER BY i.id_etapa NULLS FIRST, i.nombre
  `, [proyectoId]);

  const resAportaciones = await pool.query(`
    SELECT
      ai.id_indicador,
      ai.valor_aportado,
      a.id AS accion_id,
      a.nombre AS accion_nombre,
      a.id_accion_padre,
      et.nombre AS etapa_nombre,
      a.estado
    FROM accion_indicador ai
    JOIN acciones a ON a.id = ai.id_accion
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE ai.id_indicador IN (
      SELECT id FROM indicadores WHERE id_proyecto = $1
    )
    ORDER BY ai.id_indicador, a.id_accion_padre NULLS FIRST, a.nombre
  `, [proyectoId]);

  const aportacionesPorIndicador = {};
  for (const row of resAportaciones.rows) {
    if (!aportacionesPorIndicador[row.id_indicador]) {
      aportacionesPorIndicador[row.id_indicador] = [];
    }
    aportacionesPorIndicador[row.id_indicador].push({
      accion_id: row.accion_id,
      nombre: row.accion_nombre,
      tipo: row.id_accion_padre ? 'subaccion' : 'accion',
      etapa_nombre: row.etapa_nombre,
      valor_aportado: parseFloat(row.valor_aportado) || 0,
      estado: row.estado,
    });
  }

  return resIndicadores.rows.map(r => {
    const meta = parseFloat(r.meta_global) || 0;
    const aportado = parseFloat(r.total_aportado) || 0;
    const pct = meta > 0 ? Math.min(100, (aportado / meta) * 100) : 0;
    const unidadLabel = r.unidad === 'Porcentaje' ? '%'
      : r.unidad === 'Moneda_MXN' ? '$MXN'
      : r.unidad_personalizada || '#';
    return {
      ...r,
      meta_global: meta,
      total_aportado: aportado,
      pct_avance: parseFloat(pct.toFixed(2)),
      unidad_label: unidadLabel,
      aportaciones: aportacionesPorIndicador[r.id] || [],
    };
  });
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
      r.descripcion,
      r.entidad_tipo,
      CASE
        WHEN r.entidad_tipo = 'Proyecto'  THEN p.nombre
        WHEN r.entidad_tipo = 'Etapa'     THEN et.nombre
        WHEN r.entidad_tipo = 'Accion'    THEN ac.nombre
        WHEN r.entidad_tipo = 'Subaccion' THEN sa.nombre
      END AS etiqueta
    FROM riesgos r
    LEFT JOIN proyectos p  ON r.entidad_tipo = 'Proyecto'  AND p.id  = r.entidad_id
    LEFT JOIN etapas    et ON r.entidad_tipo = 'Etapa'     AND et.id = r.entidad_id
    LEFT JOIN acciones  ac ON r.entidad_tipo = 'Accion'    AND ac.id = r.entidad_id
    LEFT JOIN acciones  sa ON r.entidad_tipo = 'Subaccion' AND sa.id = r.entidad_id
    WHERE r.estado IN ('Abierto','En_mitigacion')
      AND (
        (r.entidad_tipo = 'Proyecto'  AND r.entidad_id = $1)
        OR (r.entidad_tipo = 'Etapa'     AND r.entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = $1))
        OR (r.entidad_tipo = 'Accion'    AND r.entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NULL))
        OR (r.entidad_tipo = 'Subaccion' AND r.entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = $1 AND id_accion_padre IS NOT NULL))
      )
    ORDER BY
      CASE r.nivel
        WHEN 'Critico' THEN 1
        WHEN 'Alto' THEN 2
        WHEN 'Medio' THEN 3
        ELSE 4
      END,
      r.created_at DESC
    LIMIT 15
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
  obtenerIndicadoresConProgreso,
};
