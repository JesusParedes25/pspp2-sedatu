/**
 * ARCHIVO: geografia.queries.js
 * PROPÓSITO: Queries para catálogo geográfico y cobertura.
 */
const pool = require('../pool');

// ─── Catálogo ─────────────────────────────────────────────────

async function obtenerEstados() {
  const { rows } = await pool.query(
    'SELECT id, clave AS cve_ent, nombre FROM cat_entidades_federativas ORDER BY nombre'
  );
  return rows;
}

async function obtenerMunicipios(idEntidad) {
  const { rows } = await pool.query(
    'SELECT id, clave, clave_mun, nombre, id_entidad FROM cat_municipios WHERE id_entidad = $1 ORDER BY nombre',
    [idEntidad]
  );
  return rows;
}

async function buscarEstadoPorNombre(nombre) {
  const { rows } = await pool.query(
    'SELECT id, clave, nombre FROM cat_entidades_federativas WHERE LOWER(nombre) = LOWER($1)',
    [nombre]
  );
  return rows[0] || null;
}

async function buscarMunicipioPorNombre(nombre, idEntidad) {
  const { rows } = await pool.query(
    'SELECT id, clave, nombre, id_entidad FROM cat_municipios WHERE LOWER(nombre) = LOWER($1) AND id_entidad = $2',
    [nombre, idEntidad]
  );
  return rows[0] || null;
}

async function buscarEstadosFuzzy(texto) {
  const { rows } = await pool.query(
    `SELECT id, clave, nombre,
       similarity(LOWER(nombre), LOWER($1)) AS score
     FROM cat_entidades_federativas
     WHERE LOWER(nombre) % LOWER($1) OR LOWER(nombre) LIKE LOWER($1) || '%'
     ORDER BY score DESC
     LIMIT 5`,
    [texto]
  );
  return rows;
}

async function buscarMunicipiosFuzzy(texto, idEntidad) {
  const { rows } = await pool.query(
    `SELECT id, clave, nombre, id_entidad,
       similarity(LOWER(nombre), LOWER($1)) AS score
     FROM cat_municipios
     WHERE id_entidad = $2 AND (LOWER(nombre) % LOWER($1) OR LOWER(nombre) LIKE LOWER($1) || '%')
     ORDER BY score DESC
     LIMIT 5`,
    [texto, idEntidad]
  );
  return rows;
}

// ─── Cobertura geográfica ─────────────────────────────────────

async function obtenerCobertura(tipoEntidad, idEntidad) {
  const { rows } = await pool.query(
    `SELECT cg.id, cg.tipo_entidad, cg.id_entidad,
       cg.id_estado, ef.nombre AS estado_nombre, ef.clave AS estado_clave,
       cg.id_municipio, m.nombre AS municipio_nombre, m.clave AS municipio_clave
     FROM cobertura_geografica cg
     LEFT JOIN cat_entidades_federativas ef ON cg.id_estado = ef.id
     LEFT JOIN cat_municipios m ON cg.id_municipio = m.id
     WHERE cg.tipo_entidad = $1 AND cg.id_entidad = $2
     ORDER BY ef.nombre, m.nombre`,
    [tipoEntidad, idEntidad]
  );
  return rows;
}

async function agregarCobertura(tipoEntidad, idEntidad, idEstado, idMunicipio) {
  const { rows } = await pool.query(
    `INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tipo_entidad, id_entidad, id_estado, id_municipio) DO NOTHING
     RETURNING *`,
    [tipoEntidad, idEntidad, idEstado, idMunicipio || null]
  );
  return rows[0];
}

async function eliminarCobertura(id) {
  const { rowCount } = await pool.query(
    'DELETE FROM cobertura_geografica WHERE id = $1',
    [id]
  );
  return rowCount > 0;
}

async function obtenerCoberturaProyecto(idProyecto) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ef.id AS id_estado, ef.nombre AS estado_nombre, ef.clave AS estado_clave,
       m.id AS id_municipio, m.nombre AS municipio_nombre, m.clave AS municipio_clave
     FROM cobertura_geografica cg
     LEFT JOIN cat_entidades_federativas ef ON cg.id_estado = ef.id
     LEFT JOIN cat_municipios m ON cg.id_municipio = m.id
     WHERE (cg.tipo_entidad = 'proyecto' AND cg.id_entidad = $1)
        OR (cg.tipo_entidad = 'etapa' AND cg.id_entidad IN (SELECT id FROM etapas WHERE id_proyecto = $1))
        OR (cg.tipo_entidad = 'accion' AND cg.id_entidad IN (SELECT id FROM acciones WHERE id_proyecto = $1))
     ORDER BY ef.nombre, m.nombre`,
    [idProyecto]
  );
  return rows;
}

/**
 * Cobertura detallada por entidad: devuelve todos los registros de cobertura
 * del proyecto con tipo_entidad e id_entidad para construir un lookup en el frontend.
 */
async function obtenerCoberturaDetalladaProyecto(idProyecto) {
  const { rows } = await pool.query(
    `SELECT cg.tipo_entidad, cg.id_entidad,
       ef.nombre AS estado_nombre, m.nombre AS municipio_nombre
     FROM cobertura_geografica cg
     LEFT JOIN cat_entidades_federativas ef ON cg.id_estado = ef.id
     LEFT JOIN cat_municipios m ON cg.id_municipio = m.id
     WHERE (cg.tipo_entidad = 'etapa' AND cg.id_entidad IN (SELECT id FROM etapas WHERE id_proyecto = $1))
        OR (cg.tipo_entidad = 'accion' AND cg.id_entidad IN (SELECT id FROM acciones WHERE id_proyecto = $1))
     ORDER BY ef.nombre, m.nombre`,
    [idProyecto]
  );
  return rows;
}

/**
 * Drill-down territorial: dado un id_estado, devuelve TODAS las acciones
 * de TODOS los proyectos que tienen cobertura en ese estado, agrupadas
 * por proyecto y etapa. Incluye riesgos e indicadores publicables.
 */
async function obtenerResumenTerritorial(idEstado, filtros = {}) {
  const params = [idEstado];
  let filtrosDG = '';
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    filtrosDG = `AND p.id_dg_lider = $${params.length}`;
  }

  // Acciones con cobertura en este estado
  const { rows: acciones } = await pool.query(`
    SELECT
      a.id AS accion_id, a.nombre AS accion_nombre, a.estado, a.porcentaje_avance,
      a.fecha_fin, a.motivo_bloqueo,
      e.id AS etapa_id, e.nombre AS etapa_nombre,
      p.id AS proyecto_id, p.nombre AS proyecto_nombre,
      dg.siglas AS dg_siglas,
      m.nombre AS municipio_nombre
    FROM cobertura_geografica cg
    JOIN acciones a ON cg.tipo_entidad = 'accion' AND cg.id_entidad = a.id
    JOIN proyectos p ON a.id_proyecto = p.id
    LEFT JOIN etapas e ON a.id_etapa = e.id
    LEFT JOIN direcciones_generales dg ON p.id_dg_lider = dg.id
    LEFT JOIN cat_municipios m ON cg.id_municipio = m.id
    WHERE cg.id_estado = $1 AND a.estado != 'Cancelada' ${filtrosDG}
    ORDER BY p.nombre, e.orden NULLS LAST, a.fecha_fin
  `, params);

  // Riesgos activos en proyectos que tocan este estado
  const proyectoIds = [...new Set(acciones.map(a => a.proyecto_id))];
  let riesgos = [];
  if (proyectoIds.length > 0) {
    const { rows } = await pool.query(`
      SELECT r.titulo, r.nivel, r.estado AS riesgo_estado, r.entidad_tipo,
        p.nombre AS proyecto_nombre, p.id AS proyecto_id
      FROM riesgos r
      JOIN proyectos p ON (
        (r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id)
        OR (r.entidad_tipo = 'Etapa' AND r.entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = p.id))
        OR (r.entidad_tipo = 'Accion' AND r.entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = p.id))
      )
      WHERE r.estado IN ('Abierto','En_mitigacion')
        AND p.id = ANY($1)
      ORDER BY CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 ELSE 3 END
      LIMIT 10
    `, [proyectoIds]);
    riesgos = rows;
  }

  // Indicadores publicables de esos proyectos
  let indicadores = [];
  if (proyectoIds.length > 0) {
    const { rows } = await pool.query(`
      SELECT i.nombre, i.meta_global, i.valor_actual, i.unidad, i.unidad_personalizada,
        p.nombre AS proyecto_nombre, p.id AS proyecto_id
      FROM indicadores i
      JOIN proyectos p ON p.id = i.id_proyecto
      WHERE i.es_publicable = true AND i.activo = true AND p.id = ANY($1)
      ORDER BY p.nombre, i.nombre
    `, [proyectoIds]);
    indicadores = rows.map(r => ({
      ...r,
      meta_global: parseFloat(r.meta_global) || 0,
      valor_actual: parseFloat(r.valor_actual) || 0,
    }));
  }

  // Agrupar acciones por proyecto → etapa
  const porProyecto = {};
  for (const a of acciones) {
    if (!porProyecto[a.proyecto_id]) {
      porProyecto[a.proyecto_id] = {
        proyecto_id: a.proyecto_id,
        proyecto_nombre: a.proyecto_nombre,
        dg_siglas: a.dg_siglas,
        etapas: {},
        total: 0,
        completadas: 0,
      };
    }
    const proy = porProyecto[a.proyecto_id];
    proy.total++;
    if (a.estado === 'Completada') proy.completadas++;

    const etKey = a.etapa_id || '__sin_etapa__';
    if (!proy.etapas[etKey]) {
      proy.etapas[etKey] = { nombre: a.etapa_nombre || 'Sin etapa', acciones: [] };
    }
    proy.etapas[etKey].acciones.push({
      id: a.accion_id,
      nombre: a.accion_nombre,
      estado: a.estado,
      porcentaje_avance: parseFloat(a.porcentaje_avance) || 0,
      fecha_fin: a.fecha_fin,
      motivo_bloqueo: a.motivo_bloqueo,
      municipio: a.municipio_nombre,
    });
  }

  // Convertir etapas de objeto a array
  const proyectos = Object.values(porProyecto).map(p => ({
    ...p,
    avance_pct: p.total > 0 ? Math.round((p.completadas / p.total) * 100) : 0,
    etapas: Object.values(p.etapas),
  }));

  return { proyectos, riesgos, indicadores };
}

/**
 * Resumen para el mapa: conteo de acciones por estado para colorear coropletas.
 */
async function obtenerResumenPorEstados(filtros = {}) {
  const params = [];
  let filtrosDG = '';
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    filtrosDG = `AND p.id_dg_lider = $${params.length}`;
  }

  const { rows } = await pool.query(`
    SELECT
      ef.id AS id_estado, ef.clave, ef.nombre,
      COUNT(*)::int AS total_acciones,
      COUNT(*) FILTER (WHERE a.estado = 'Completada')::int AS completadas,
      COUNT(*) FILTER (WHERE a.estado = 'En_proceso')::int AS en_proceso,
      COUNT(*) FILTER (WHERE a.estado = 'Bloqueada')::int AS bloqueadas,
      COUNT(*) FILTER (WHERE a.estado = 'Pendiente')::int AS pendientes
    FROM cobertura_geografica cg
    JOIN cat_entidades_federativas ef ON cg.id_estado = ef.id
    JOIN acciones a ON cg.tipo_entidad = 'accion' AND cg.id_entidad = a.id
    JOIN proyectos p ON a.id_proyecto = p.id
    WHERE a.estado != 'Cancelada' ${filtrosDG}
    GROUP BY ef.id, ef.clave, ef.nombre
    ORDER BY ef.nombre
  `, params);

  return rows.map(r => ({
    ...r,
    avance_pct: r.total_acciones > 0 ? Math.round((r.completadas / r.total_acciones) * 100) : 0,
  }));
}

async function obtenerZonasMetropolitanas() {
  const { rows } = await pool.query(
    'SELECT gid, cve_met, nombre, tipo FROM geo_zm ORDER BY nombre'
  );
  return rows;
}

async function obtenerMunicipiosPorEstadoClave(claveEstado) {
  const { rows } = await pool.query(
    `SELECT id, clave, clave_mun AS cve_mun, nombre FROM cat_municipios
     WHERE id_entidad = (SELECT id FROM cat_entidades_federativas WHERE clave = $1)
     ORDER BY nombre`,
    [claveEstado]
  );
  return rows;
}

module.exports = {
  obtenerEstados,
  obtenerMunicipios,
  obtenerMunicipiosPorEstadoClave,
  obtenerZonasMetropolitanas,
  buscarEstadoPorNombre,
  buscarMunicipioPorNombre,
  buscarEstadosFuzzy,
  buscarMunicipiosFuzzy,
  obtenerCobertura,
  agregarCobertura,
  eliminarCobertura,
  obtenerCoberturaProyecto,
  obtenerCoberturaDetalladaProyecto,
  obtenerResumenTerritorial,
  obtenerResumenPorEstados,
};
