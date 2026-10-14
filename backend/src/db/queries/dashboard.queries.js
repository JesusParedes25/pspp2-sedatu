/**
 * ARCHIVO: dashboard.queries.js
 * PROPÓSITO: Queries agregadas para el dashboard ejecutivo.
 *
 * Fase 2 / Paso 2 (docs/modelo-permisos.md sección 9.1): sin ningún
 * importador vivo en el frontend hoy (confirmado, `frontend/src/api/
 * dashboard.js` sin callers) — se conecta igual al alcance real del
 * usuario porque así se pidió, defensivo para cualquier consumidor
 * futuro o directo a la API. `alcanceProyectoIds` es el alcance real
 * (null = sin restricción, superadmin/ejecutivo); `filtros.id_dg` es un
 * filtro de conveniencia que solo puede ACOTAR dentro de ese alcance,
 * nunca ampliarlo — ambas condiciones se combinan con AND, así que un
 * `id_dg` ajeno al alcance del usuario da una lista vacía, nunca un
 * error ni la lista sin filtrar.
 */
const pool = require('../pool');
const { condicionRiesgoDeProyecto } = require('../../utils/condicion-riesgo');
const { calcularAvancePorcentaje } = require('../../utils/indicador-calculo');

// Construye, a partir del alcance real (lista de ids o null) y el filtro
// de conveniencia ?id_dg=, las condiciones SQL a unir con AND y sus
// parámetros — mismo orden de precedencia en las 4 funciones de este
// archivo, para que ninguna diverja de las demás.
function condicionesAlcance(alcanceProyectoIds, filtros, paramsIniciales = []) {
  const params = [...paramsIniciales];
  const condiciones = [];
  if (alcanceProyectoIds !== null) {
    params.push(alcanceProyectoIds);
    condiciones.push(`p.id = ANY($${params.length})`);
  }
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    condiciones.push(`p.id_dg_lider = $${params.length}`);
  }
  const sql = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';
  return { sql, params };
}

/**
 * Métricas globales: total proyectos, acciones, avance, estados activos.
 */
async function obtenerMetricasGlobales(filtros = {}, alcanceProyectoIds = null) {
  const { sql: filtroExtra, params } = condicionesAlcance(alcanceProyectoIds, filtros);

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
    WHERE p.estado != 'Cancelada' AND p.deleted_at IS NULL ${filtroExtra}
  `, params);

  const totalNoCancel = (metricas.total_acciones || 1);
  metricas.avance_global = Math.round(((metricas.acciones_completadas || 0) / totalNoCancel) * 100);
  return metricas;
}

/**
 * Avance por DG: para barras horizontales del dashboard. Antes no
 * recibía ningún filtro — mostraba el avance de TODAS las DGs sin
 * importar el alcance de quien preguntara.
 */
async function obtenerAvancePorDG(filtros = {}, alcanceProyectoIds = null) {
  const { sql: filtroExtra, params } = condicionesAlcance(alcanceProyectoIds, filtros);

  const { rows } = await pool.query(`
    SELECT
      dg.id, dg.siglas, dg.nombre,
      COUNT(DISTINCT p.id)::int AS proyectos,
      COUNT(a.id)::int AS total_acciones,
      COUNT(a.id) FILTER (WHERE a.estado = 'Completada')::int AS completadas
    FROM direcciones_generales dg
    JOIN proyectos p ON p.id_dg_lider = dg.id AND p.estado != 'Cancelada' AND p.deleted_at IS NULL ${filtroExtra}
    LEFT JOIN acciones a ON a.id_proyecto = p.id AND a.id_accion_padre IS NULL AND a.estado != 'Cancelada'
    GROUP BY dg.id, dg.siglas, dg.nombre
    HAVING COUNT(a.id) > 0
    ORDER BY dg.siglas
  `, params);

  return rows.map(r => ({
    ...r,
    avance_pct: r.total_acciones > 0 ? Math.round((r.completadas / r.total_acciones) * 100) : 0,
  }));
}

/**
 * Alertas: acciones vencidas, riesgos críticos, DGs inactivas.
 */
async function obtenerAlertas(filtros = {}, alcanceProyectoIds = null) {
  const { sql: filtroExtra, params } = condicionesAlcance(alcanceProyectoIds, filtros);

  // Acciones vencidas
  const { rows: vencidas } = await pool.query(`
    SELECT a.id, a.nombre, a.fecha_fin, p.nombre AS proyecto_nombre,
      EXTRACT(DAY FROM NOW() - a.fecha_fin)::int AS dias_atraso
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    WHERE a.fecha_fin < NOW() AND a.estado NOT IN ('Completada','Cancelada')
      AND a.id_accion_padre IS NULL ${filtroExtra}
    ORDER BY a.fecha_fin ASC LIMIT 10
  `, params);

  // Riesgos críticos (cualquier nivel: Proyecto, Etapa, Acción, Subacción o Tarea)
  const { rows: riesgos } = await pool.query(`
    SELECT r.titulo, r.nivel, r.created_at, p.nombre AS proyecto_nombre
    FROM riesgos r
    JOIN proyectos p ON ${condicionRiesgoDeProyecto('p.id')} AND p.deleted_at IS NULL
    WHERE r.estado IN ('Abierto','En_mitigacion') AND r.nivel IN ('Critico','Alto')
      ${filtroExtra}
    ORDER BY CASE r.nivel WHEN 'Critico' THEN 1 ELSE 2 END, r.created_at DESC
    LIMIT 5
  `, params);

  return { vencidas, riesgos };
}

/**
 * Indicadores publicables con progreso (para sección del dashboard).
 */
async function obtenerIndicadoresPublicables(filtros = {}, alcanceProyectoIds = null) {
  const { sql: filtroExtra, params } = condicionesAlcance(alcanceProyectoIds, filtros);

  const { rows } = await pool.query(`
    SELECT i.id, i.nombre, i.meta_global, i.valor_actual, i.unidad, i.unidad_personalizada,
      p.nombre AS proyecto_nombre, dg.siglas AS dg_siglas
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL AND p.estado != 'Cancelada'
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE i.es_publicable = true AND i.activo = true ${filtroExtra}
    ORDER BY dg.siglas, p.nombre
  `, params);

  return rows.map(r => ({
    ...r,
    meta_global: parseFloat(r.meta_global) || 0,
    valor_actual: parseFloat(r.valor_actual) || 0,
    avance_pct: calcularAvancePorcentaje(r.valor_actual, r.meta_global),
  }));
}

module.exports = {
  obtenerMetricasGlobales,
  obtenerAvancePorDG,
  obtenerAlertas,
  obtenerIndicadoresPublicables,
};
