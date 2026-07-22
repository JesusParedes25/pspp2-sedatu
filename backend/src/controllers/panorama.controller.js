/**
 * ARCHIVO: panorama.controller.js
 * PROPÓSITO: Endpoint GET /proyectos/:id/panorama — datos completos del tab Panorama.
 */
const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');
const statsQueries = require('../db/queries/proyectos.stats.queries');
const etapasQueries = require('../db/queries/etapas.queries');
const inicioQueries = require('../db/queries/inicio.queries');

// GET /proyectos/:id/panorama
async function obtenerPanorama(req, res, next) {
  try {
    const proyectoId = req.params.id;

    // Fetch full project record
    const { rows: [proyecto] } = await pool.query(`
      SELECT p.*,
        dg.siglas AS dg_lider_siglas, dg.nombre AS dg_lider_nombre,
        da.siglas AS direccion_area_siglas, da.nombre AS direccion_area_nombre,
        u.nombre_completo AS creador_nombre,
        pr.nombre AS programa_nombre, pr.clave AS programa_clave
      FROM proyectos p
      LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
      LEFT JOIN direcciones_area da ON da.id = p.id_direccion_area_lider
      LEFT JOIN usuarios u ON u.id = p.id_creador
      LEFT JOIN programas pr ON pr.id = p.id_programa
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `, [proyectoId]);

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }

    // Fetch all panorama data in parallel
    const [miembros, indicadores, cobertura, vencidos, porVencer, riesgos, actividad] = await Promise.all([
      obtenerTodosParticipantes(proyectoId),
      obtenerIndicadoresCompletos(proyectoId),
      obtenerCoberturaProyecto(proyectoId),
      statsQueries.obtenerAtrasadas(proyectoId),
      statsQueries.obtenerProximasAVencer(proyectoId),
      statsQueries.obtenerRiesgosDetalle(proyectoId),
      statsQueries.obtenerActividadReciente(proyectoId),
    ]);

    res.json({
      datos: {
        proyecto,
        miembros,
        indicadores,
        cobertura,
        vencidos,
        por_vencer: porVencer,
        riesgos,
        actividad
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Indicadores completos con valor realizado, metas anuales y aportaciones.
 */
async function obtenerIndicadoresCompletos(proyectoId) {
  const { rows: indicadores } = await pool.query(`
    SELECT i.id, i.nombre, i.tipo, i.unidad, i.unidad_personalizada, i.etiqueta_unidad,
      i.meta_global, i.valor_actual, i.modo_calculo, i.temporalidad, i.descripcion,
      i.id_etapa, e.nombre AS etapa_nombre,
      i.es_publicable
    FROM indicadores i
    LEFT JOIN etapas e ON e.id = i.id_etapa
    WHERE i.id_proyecto = $1 AND i.activo = true
    ORDER BY i.id_etapa NULLS FIRST, i.orden, i.created_at
  `, [proyectoId]);

  // Fetch metas anuales for all indicators
  const indIds = indicadores.map(i => i.id);
  let metasPorIndicador = {};
  if (indIds.length > 0) {
    const { rows: metas } = await pool.query(`
      SELECT id_indicador, anio, meta AS valor_meta, valor_actual AS valor_real
      FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1)
      ORDER BY anio
    `, [indIds]);
    for (const m of metas) {
      if (!metasPorIndicador[m.id_indicador]) metasPorIndicador[m.id_indicador] = [];
      metasPorIndicador[m.id_indicador].push(m);
    }
  }

  // Fetch aportaciones for all indicators
  let aportacionesPorIndicador = {};
  if (indIds.length > 0) {
    const { rows: aportaciones } = await pool.query(`
      SELECT ia.id_indicador, ia.id, ia.aportacion, ia.modo, ia.id_etapa, ia.id_accion,
        COALESCE(et.nombre, ac.nombre) AS nodo_nombre,
        COALESCE(et.estado, ac.estado) AS nodo_estado,
        COALESCE(
          CASE WHEN ia.id_etapa IS NOT NULL THEN COALESCE(et.avance_actual, et.porcentaje_calculado) END,
          CASE WHEN ia.id_accion IS NOT NULL THEN COALESCE(ac.avance_actual, ac.porcentaje_avance) END,
          0
        )::numeric AS avance_nodo
      FROM indicador_aportaciones ia
      LEFT JOIN etapas et ON et.id = ia.id_etapa
      LEFT JOIN acciones ac ON ac.id = ia.id_accion
      WHERE ia.id_indicador = ANY($1)
      ORDER BY ia.created_at
    `, [indIds]);
    for (const a of aportaciones) {
      if (!aportacionesPorIndicador[a.id_indicador]) aportacionesPorIndicador[a.id_indicador] = [];
      aportacionesPorIndicador[a.id_indicador].push(a);
    }
  }

  return indicadores.map(i => {
    const meta = parseFloat(i.meta_global) || 0;
    const valor = parseFloat(i.valor_actual) || 0;
    const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : null;
    return {
      ...i,
      meta_global: meta,
      valor_actual: valor,
      pct_avance: pct !== null ? parseFloat(pct.toFixed(1)) : null,
      metas_anuales: metasPorIndicador[i.id] || [],
      aportaciones: aportacionesPorIndicador[i.id] || []
    };
  });
}

/**
 * Cobertura geográfica del proyecto (estados y municipios).
 */
async function obtenerCoberturaProyecto(proyectoId) {
  const { rows } = await pool.query(`
    SELECT cg.id, cg.id_estado, cg.id_municipio,
      ef.nombre AS estado_nombre, ef.clave AS estado_clave,
      m.nombre AS municipio_nombre, m.clave AS municipio_clave
    FROM cobertura_geografica cg
    LEFT JOIN cat_entidades_federativas ef ON ef.id = cg.id_estado
    LEFT JOIN cat_municipios m ON m.id = cg.id_municipio
    WHERE cg.tipo_entidad = 'proyecto' AND cg.id_entidad = $1
    ORDER BY ef.nombre, m.nombre
  `, [proyectoId]);
  return rows;
}

/**
 * Retorna todos los participantes únicos del proyecto:
 * miembros del proyecto + miembros de nodos (etapas, acciones y tareas).
 * Prioriza rol del proyecto sobre rol de nodo.
 * Incluye DA, cargo y nombre del nodo de alcance.
 */
async function obtenerTodosParticipantes(proyectoId) {
  const { rows } = await pool.query(`
    WITH fuentes AS (
      SELECT pu.id_usuario, pu.rol, 'proyecto' AS alcance,
             NULL::text AS nodo_nombre, NULL::text AS nodo_tipo
      FROM proyecto_usuarios pu
      WHERE pu.id_proyecto = $1
      UNION ALL
      SELECT nm.id_usuario, nm.rol, 'etapa' AS alcance,
             e.nombre AS nodo_nombre, 'etapa' AS nodo_tipo
      FROM nodo_miembros nm
      JOIN etapas e ON nm.tipo_nodo = 'etapa' AND nm.id_nodo = e.id
      WHERE e.id_proyecto = $1
      UNION ALL
      SELECT nm.id_usuario, nm.rol, 'accion' AS alcance,
             a.nombre AS nodo_nombre, 'accion' AS nodo_tipo
      FROM nodo_miembros nm
      JOIN acciones a ON nm.tipo_nodo = 'accion' AND nm.id_nodo = a.id
      WHERE a.id_proyecto = $1
      UNION ALL
      SELECT nm.id_usuario, nm.rol, 'tarea' AS alcance,
             t.nombre AS nodo_nombre, 'tarea' AS nodo_tipo
      FROM nodo_miembros nm
      JOIN tareas t ON nm.tipo_nodo = 'tarea' AND nm.id_nodo = t.id
      JOIN acciones a2 ON t.id_accion = a2.id
      WHERE a2.id_proyecto = $1
    )
    SELECT DISTINCT ON (u.id)
      u.id AS id_usuario, u.nombre_completo, u.correo, u.cargo,
      dg.siglas AS dg_siglas,
      da.siglas AS da_siglas,
      f.rol, f.alcance, f.nodo_nombre, f.nodo_tipo
    FROM fuentes f
    JOIN usuarios u ON u.id = f.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
    ORDER BY u.id,
      CASE f.alcance WHEN 'proyecto' THEN 1 WHEN 'etapa' THEN 2 WHEN 'accion' THEN 3 ELSE 4 END
  `, [proyectoId]);
  return rows;
}

// GET /proyectos/:id/panorama-rapido — vista compacta para el hover de ProyectoCard
// en Inicio: árbol de etapas (nivel superior) + últimas actividades del proyecto.
// Deliberadamente ligero (sin subacciones/tareas anidadas) para que responda
// rápido en un hover sin disparar N+1 queries pesadas.
async function obtenerPanoramaRapido(req, res, next) {
  try {
    const proyectoId = req.params.id;
    const [etapas, actividad] = await Promise.all([
      etapasQueries.obtenerEtapasPorProyecto(proyectoId),
      inicioQueries.obtenerActividadReciente([proyectoId]),
    ]);

    res.json({
      datos: {
        etapas: etapas.map(e => ({
          id: e.id, nombre: e.nombre, estado: e.estado, semaforo: e.semaforo,
          avance: e.avance_actual ?? Number(e.porcentaje_calculado) ?? 0,
          total_acciones: Number(e.total_acciones) || 0,
          acciones_completadas: Number(e.acciones_completadas) || 0,
        })),
        actividad: actividad.slice(0, 6),
      },
    });
  } catch (err) { next(err); }
}

module.exports = { obtenerPanorama, obtenerPanoramaRapido };
