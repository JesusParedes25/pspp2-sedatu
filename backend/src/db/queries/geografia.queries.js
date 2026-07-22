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

// ─── Geo selectors from geo_* tables ──────────────────────────

async function obtenerEstadosGeo() {
  const { rows } = await pool.query(
    'SELECT cve_ent, nombre FROM geo_estados ORDER BY nombre'
  );
  return rows;
}

async function obtenerMunicipiosGeo(cveEnt) {
  const { rows } = await pool.query(
    `SELECT cvegeo, cve_ent, cve_mun, nombre FROM geo_municipios
     WHERE cve_ent = $1 ORDER BY nombre`,
    [cveEnt]
  );
  return rows;
}

async function obtenerZMGeo() {
  const { rows } = await pool.query(
    'SELECT gid, cve_met, nombre, tipo FROM geo_zm ORDER BY nombre'
  );
  return rows;
}

// ─── GeoJSON endpoints (simplified geometry) ──────────────────

async function obtenerEstadosGeoJSON() {
  const { rows } = await pool.query(`
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(
        json_build_object(
          'type', 'Feature',
          'properties', json_build_object('cve_ent', cve_ent, 'nombre', nombre),
          'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.01))::json
        )
      ), '[]'::json)
    ) AS fc
    FROM geo_estados
    WHERE geom IS NOT NULL
  `);
  return rows[0].fc;
}

async function obtenerMunicipiosGeoJSON(cveEnt) {
  const params = cveEnt ? [cveEnt] : [];
  const where = cveEnt ? 'WHERE cve_ent = $1 AND geom IS NOT NULL' : 'WHERE geom IS NOT NULL';
  const { rows } = await pool.query(`
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(
        json_build_object(
          'type', 'Feature',
          'properties', json_build_object('cvegeo', cvegeo, 'cve_ent', cve_ent, 'cve_mun', cve_mun, 'nombre', nombre),
          'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))::json
        )
      ), '[]'::json)
    ) AS fc
    FROM geo_municipios
    ${where}
  `, params);
  return rows[0].fc;
}

async function obtenerZMGeoJSON() {
  const { rows } = await pool.query(`
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(
        json_build_object(
          'type', 'Feature',
          'properties', json_build_object('gid', gid, 'cve_met', cve_met, 'nombre', nombre, 'tipo', tipo),
          'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))::json
        )
      ), '[]'::json)
    ) AS fc
    FROM geo_zm
    WHERE geom IS NOT NULL
  `);
  return rows[0].fc;
}

// ─── Project mapa-territorial ─────────────────────────────────

async function obtenerMapaTerritorialProyecto(proyectoId) {
  const { rows } = await pool.query(`
    WITH nodos AS (
      SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
             e.estado, e.semaforo, COALESCE(e.avance_actual, e.porcentaje_calculado::int, 0) AS avance,
             e.cve_ent, e.cve_mun AS cvegeo
      FROM etapas e
      WHERE e.id_proyecto = $1 AND e.cve_ent IS NOT NULL
      UNION ALL
      SELECT CASE WHEN a.id_accion_padre IS NOT NULL THEN 'tarea' ELSE 'accion' END,
             a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
             a.estado, a.semaforo, COALESCE(a.avance_actual, 0) AS avance,
             a.cve_ent, a.cve_mun AS cvegeo
      FROM acciones a
      LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
      LEFT JOIN etapas et ON et.id = a.id_etapa
      WHERE a.id_proyecto = $1 AND a.cve_ent IS NOT NULL
    )
    SELECT n.tipo, n.id, n.nombre, n.nombre_padre, n.estado, n.semaforo, n.avance, n.cve_ent, n.cvegeo,
           gs.nombre AS nombre_estado
    FROM nodos n
    JOIN geo_estados gs ON gs.cve_ent = n.cve_ent
    ORDER BY gs.nombre, n.tipo, n.nombre
  `, [proyectoId]);

  const porEstado = {};
  for (const r of rows) {
    if (!porEstado[r.cve_ent]) {
      porEstado[r.cve_ent] = { cve_ent: r.cve_ent, nombre_estado: r.nombre_estado, nodos: [] };
    }
    porEstado[r.cve_ent].nodos.push({
      tipo: r.tipo, id: r.id, nombre: r.nombre, nombre_padre: r.nombre_padre,
      estado: r.estado, semaforo: r.semaforo,
      avance: parseFloat(r.avance) || 0, cvegeo: r.cvegeo,
    });
  }

  const estadosConActividad = Object.values(porEstado);
  const cvegeos = [...new Set(rows.filter(r => r.cvegeo).map(r => r.cvegeo))];
  return { por_estado: estadosConActividad, cvegeos };
}

// ─── Inicio mapa ───────────────────────────────────────────────

async function obtenerMapaIncidenciaGeo(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    WITH nodos_proyectos AS (
      SELECT DISTINCT e.cve_ent, e.id_proyecto
      FROM etapas e WHERE e.id_proyecto = ANY($1) AND e.cve_ent IS NOT NULL
      UNION
      SELECT DISTINCT a.cve_ent, a.id_proyecto
      FROM acciones a WHERE a.id_proyecto = ANY($1) AND a.cve_ent IS NOT NULL
    ),
    por_estado AS (
      SELECT np.cve_ent, gs.nombre AS nombre_estado,
             json_agg(json_build_object('id', p.id, 'nombre', p.nombre) ORDER BY p.nombre) AS proyectos
      FROM nodos_proyectos np
      JOIN proyectos p ON p.id = np.id_proyecto
      JOIN geo_estados gs ON gs.cve_ent = np.cve_ent
      GROUP BY np.cve_ent, gs.nombre
    )
    SELECT cve_ent, nombre_estado, proyectos
    FROM por_estado
    ORDER BY nombre_estado
  `, [proyectoIds]);
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

// ─── Territorio detalle (sidebar enriquecido) ─────────────────

/**
 * Detalle completo de un estado para el sidebar del módulo Territorio.
 * Usa cve_ent directo en etapas/acciones (nuevo esquema).
 * Respeta acceso: superadmin/ejecutivo ven todo; otros solo proyectos donde son miembros.
 */
async function obtenerDetalleEstado(cveEnt, proyectoIds) {
  // proyectoIds = null means all (superadmin/ejecutivo); [] means no access
  const filtroProyecto = proyectoIds === null
    ? ''
    : `AND p.id = ANY($2)`;
  const params = proyectoIds === null ? [cveEnt] : [cveEnt, proyectoIds];

  // 1. Nodos (etapas + acciones) en ese estado
  const { rows: nodos } = await pool.query(`
    SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
           e.estado, e.semaforo,
           COALESCE(e.avance_actual, 0)::int AS avance,
           e.fecha_fin AS fecha_limite,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE e.cve_ent = $1 ${filtroProyecto}
    UNION ALL
    SELECT CASE WHEN a.id_accion_padre IS NOT NULL THEN 'tarea' ELSE 'accion' END,
           a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
           a.estado, a.semaforo,
           COALESCE(a.avance_actual, 0)::int,
           COALESCE(a.fecha_limite, a.fecha_fin),
           p.id::text, p.nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE a.cve_ent = $1 ${filtroProyecto}
    ORDER BY nombre_proyecto, nombre
  `, params);

  const proyectoIdsEncontrados = [...new Set(nodos.map(n => n.id_proyecto))];
  if (proyectoIdsEncontrados.length === 0) {
    return {
      cve_ent: cveEnt, nombre: null,
      num_proyectos: 0, num_etapas: 0, num_riesgos: 0, avance_promedio: 0,
      proyectos: [], indicadores: [], etapas: [], riesgos: [],
      vencidos: [], por_vencer: [],
    };
  }

  // 2. Nombre del estado
  const { rows: estRows } = await pool.query(
    'SELECT nombre FROM geo_estados WHERE cve_ent = $1', [cveEnt]
  );
  const nombreEstado = estRows[0]?.nombre || cveEnt;

  // 3. Métricas por proyecto — SOLO de lo que ese proyecto tiene EN ESTE ESTADO,
  // no el avance/semáforo global del proyecto. Se deriva de `nodos` (ya
  // filtrado por cve_ent) en vez de leer porcentaje_calculado del proyecto.
  const etapaIdsAqui = nodos.filter(n => n.tipo === 'etapa').map(n => n.id);
  const porProyectoAqui = {};
  for (const n of nodos) {
    if (!porProyectoAqui[n.id_proyecto]) {
      porProyectoAqui[n.id_proyecto] = { id: n.id_proyecto, nombre: n.nombre_proyecto, suma: 0, cuenta: 0, num_etapas_aqui: 0 };
    }
    const p = porProyectoAqui[n.id_proyecto];
    p.suma += Number(n.avance);
    p.cuenta++;
    if (n.tipo === 'etapa') p.num_etapas_aqui++;
  }
  const proyMetrics = Object.values(porProyectoAqui)
    .map(p => {
      const avance = p.cuenta ? Math.round(p.suma / p.cuenta) : 0;
      return {
        id: p.id, nombre: p.nombre, avance,
        semaforo: avance >= 80 ? 'verde' : avance >= 40 ? 'ambar' : 'rojo',
        num_etapas_aqui: p.num_etapas_aqui,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // 4. Indicadores de este estado: los ligados a una etapa de aquí (atribución
  // precisa) MÁS los de alcance global (sin id_etapa) de los proyectos que
  // SÍ operan en este estado — es la mejor atribución posible dado que la
  // mayoría de los indicadores no se capturan por etapa, solo por proyecto.
  const { rows: indicadores } = await pool.query(`
    SELECT i.nombre, i.unidad, i.unidad_personalizada,
           COALESCE(i.meta_global, 0) AS meta_global,
           COALESCE(i.valor_actual, 0) AS realizado,
           CASE WHEN i.meta_global > 0
                THEN ROUND((i.valor_actual / i.meta_global * 100)::numeric, 1)
                ELSE NULL END AS pct_meta
    FROM indicadores i
    WHERE i.activo = true
      AND (i.id_etapa = ANY($1) OR (i.id_etapa IS NULL AND i.id_proyecto = ANY($2)))
    ORDER BY i.nombre
  `, [etapaIdsAqui, proyectoIdsEncontrados]);

  // 5. Riesgos abiertos — solo los ligados directamente a una etapa/acción
  // presente en este estado (no riesgos de alcance "Proyecto" completo).
  const nodoIdsAqui = nodos.map(n => n.id);
  const { rows: riesgos } = nodoIdsAqui.length ? await pool.query(`
    SELECT r.titulo, r.descripcion, r.nivel, r.estado AS estado_riesgo,
           p.id::text AS id_proyecto
    FROM riesgos r
    JOIN proyectos p ON (
      (r.entidad_tipo = 'Etapa'  AND r.entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = p.id)) OR
      (r.entidad_tipo = 'Accion' AND r.entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = p.id))
    )
    WHERE r.entidad_id = ANY($1::uuid[])
      AND p.id = ANY($2)
      AND r.estado IN ('Abierto','En_mitigacion')
    ORDER BY CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END
    LIMIT 20
  `, [nodoIdsAqui, proyectoIdsEncontrados]) : { rows: [] };

  // 6. Vencidos y por vencer (próximos 14 días)
  const { rows: venc } = await pool.query(`
    SELECT n.dias, n.nombre, n.id::text AS id_nodo, n.nombre_proyecto
    FROM (
      SELECT (e.fecha_fin::date - CURRENT_DATE)::int AS dias, e.nombre, e.id,
             p.nombre AS nombre_proyecto
      FROM etapas e JOIN proyectos p ON p.id = e.id_proyecto
      WHERE e.cve_ent = $1 AND e.fecha_fin IS NOT NULL
        AND e.estado NOT IN ('Completada','Cancelada') AND e.id_proyecto = ANY($2)
      UNION ALL
      SELECT (COALESCE(a.fecha_limite,a.fecha_fin)::date - CURRENT_DATE)::int,
             a.nombre, a.id, p.nombre
      FROM acciones a JOIN proyectos p ON p.id = a.id_proyecto
      WHERE a.cve_ent = $1 AND COALESCE(a.fecha_limite,a.fecha_fin) IS NOT NULL
        AND a.estado NOT IN ('Completada','Cancelada') AND a.id_proyecto = ANY($2)
    ) n
    WHERE n.dias <= 14
    ORDER BY n.dias
  `, [cveEnt, proyectoIdsEncontrados]);

  const avancePromedio = proyMetrics.length
    ? Math.round(proyMetrics.reduce((s, p) => s + Number(p.avance), 0) / proyMetrics.length)
    : 0;

  return {
    cve_ent: cveEnt,
    nombre: nombreEstado,
    num_proyectos: proyMetrics.length,
    num_etapas: nodos.filter(n => n.tipo === 'etapa').length,
    num_riesgos: riesgos.length,
    avance_promedio: avancePromedio,
    proyectos: proyMetrics.map(p => ({
      id: p.id, nombre: p.nombre,
      avance: Number(p.avance),
      num_etapas_aqui: Number(p.num_etapas_aqui) || 0,
      semaforo: p.semaforo,
    })),
    indicadores: indicadores.map(i => ({
      nombre: i.nombre,
      unidad: i.unidad_personalizada || i.unidad,
      meta_global: Number(i.meta_global),
      realizado: Number(i.realizado),
      pct_meta: i.pct_meta !== null ? Number(i.pct_meta) : null,
    })),
    etapas: nodos.map(n => ({
      id: n.id, tipo: n.tipo, nombre: n.nombre, nombre_padre: n.nombre_padre,
      id_proyecto: n.id_proyecto, nombre_proyecto: n.nombre_proyecto,
      estatus: n.estado, avance: Number(n.avance), semaforo: n.semaforo,
    })),
    riesgos: riesgos.map(r => ({
      titulo: r.titulo,
      descripcion: r.descripcion,
      nivel: r.nivel,
      estado: r.estado_riesgo,
      id_proyecto: r.id_proyecto,
    })),
    vencidos: venc.filter(v => v.dias < 0).map(v => ({
      dias: v.dias, nombre: v.nombre,
      id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto,
    })),
    por_vencer: venc.filter(v => v.dias >= 0).map(v => ({
      dias: v.dias, nombre: v.nombre,
      id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto,
    })),
  };
}

/**
 * Actividad por municipio dentro de un estado, para el drill-down del mapa:
 * qué municipios tienen etapas/acciones asignadas (cve_mun guarda el cvegeo
 * completo de 5 dígitos, ver EtapasAvancesMD → selector "Municipio").
 * Respeta el mismo esquema de acceso que obtenerDetalleEstado.
 */
async function obtenerMunicipiosActividadEstado(cveEnt, proyectoIds) {
  const filtroProyecto = proyectoIds === null ? '' : 'AND p.id = ANY($2)';
  const params = proyectoIds === null ? [cveEnt] : [cveEnt, proyectoIds];

  const { rows } = await pool.query(`
    SELECT e.cve_mun AS cvegeo, e.id::text, e.nombre,
           e.estado, e.semaforo, COALESCE(e.avance_actual, 0)::int AS avance,
           'etapa'::text AS tipo, NULL::text AS nombre_padre,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE e.cve_mun IS NOT NULL AND LEFT(e.cve_mun, 2) = $1 ${filtroProyecto}
    UNION ALL
    SELECT a.cve_mun, a.id::text, a.nombre,
           a.estado, a.semaforo, COALESCE(a.avance_actual, 0)::int,
           CASE WHEN a.id_accion_padre IS NOT NULL THEN 'tarea' ELSE 'accion' END,
           COALESCE(padre.nombre, et.nombre),
           p.id::text, p.nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE a.cve_mun IS NOT NULL AND LEFT(a.cve_mun, 2) = $1 ${filtroProyecto}
    ORDER BY nombre
  `, params);

  const porMunicipio = {};
  for (const r of rows) {
    if (!porMunicipio[r.cvegeo]) {
      porMunicipio[r.cvegeo] = { cvegeo: r.cvegeo, num_etapas: 0, proyectos: new Set(), etapas: [] };
    }
    const m = porMunicipio[r.cvegeo];
    m.num_etapas++;
    m.proyectos.add(r.id_proyecto);
    m.etapas.push({
      id: r.id, tipo: r.tipo, nombre: r.nombre, nombre_padre: r.nombre_padre,
      estatus: r.estado, semaforo: r.semaforo, avance: Number(r.avance),
      id_proyecto: r.id_proyecto, nombre_proyecto: r.nombre_proyecto,
    });
  }

  return Object.values(porMunicipio).map(m => ({
    cvegeo: m.cvegeo,
    num_etapas: m.num_etapas,
    num_proyectos: m.proyectos.size,
    etapas: m.etapas,
  }));
}

/**
 * Detalle de una Zona Metropolitana — misma forma que obtenerDetalleEstado
 * pero filtrando etapas/acciones por id_zm en vez de cve_ent.
 */
async function obtenerDetalleZM(gidZm, proyectoIds) {
  const filtroProyecto = proyectoIds === null ? '' : 'AND p.id = ANY($2)';
  const params = proyectoIds === null ? [gidZm] : [gidZm, proyectoIds];

  const { rows: nodos } = await pool.query(`
    SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
           e.estado, e.semaforo, COALESCE(e.avance_actual, 0)::int AS avance,
           e.fecha_fin AS fecha_limite,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE e.id_zm = $1 ${filtroProyecto}
    UNION ALL
    SELECT CASE WHEN a.id_accion_padre IS NOT NULL THEN 'tarea' ELSE 'accion' END,
           a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
           a.estado, a.semaforo, COALESCE(a.avance_actual, 0)::int,
           COALESCE(a.fecha_limite, a.fecha_fin),
           p.id::text, p.nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE a.id_zm = $1 ${filtroProyecto}
    ORDER BY nombre_proyecto, nombre
  `, params);

  const proyectoIdsEncontrados = [...new Set(nodos.map(n => n.id_proyecto))];
  if (proyectoIdsEncontrados.length === 0) {
    return {
      cve_met: null, gid: gidZm, nombre: null,
      num_proyectos: 0, num_etapas: 0, num_riesgos: 0, avance_promedio: 0,
      proyectos: [], indicadores: [], etapas: [], riesgos: [],
      vencidos: [], por_vencer: [],
    };
  }

  const { rows: zmRows } = await pool.query('SELECT cve_met, nombre FROM geo_zm WHERE gid = $1', [gidZm]);
  const nombreZm = zmRows[0]?.nombre || null;
  const cveMet = zmRows[0]?.cve_met || null;

  // Métricas por proyecto, indicadores y riesgos SOLO de lo que cae dentro de
  // esta ZM — mismo criterio de alcance que obtenerDetalleEstado (no se usa
  // el avance/semáforo global del proyecto).
  const etapaIdsAqui = nodos.filter(n => n.tipo === 'etapa').map(n => n.id);
  const porProyectoAqui = {};
  for (const n of nodos) {
    if (!porProyectoAqui[n.id_proyecto]) {
      porProyectoAqui[n.id_proyecto] = { id: n.id_proyecto, nombre: n.nombre_proyecto, suma: 0, cuenta: 0, num_etapas_aqui: 0 };
    }
    const p = porProyectoAqui[n.id_proyecto];
    p.suma += Number(n.avance);
    p.cuenta++;
    if (n.tipo === 'etapa') p.num_etapas_aqui++;
  }
  const proyMetrics = Object.values(porProyectoAqui)
    .map(p => {
      const avance = p.cuenta ? Math.round(p.suma / p.cuenta) : 0;
      return {
        id: p.id, nombre: p.nombre, avance,
        semaforo: avance >= 80 ? 'verde' : avance >= 40 ? 'ambar' : 'rojo',
        num_etapas_aqui: p.num_etapas_aqui,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { rows: indicadores } = await pool.query(`
    SELECT i.nombre, i.unidad, i.unidad_personalizada,
           COALESCE(i.meta_global, 0) AS meta_global,
           COALESCE(i.valor_actual, 0) AS realizado,
           CASE WHEN i.meta_global > 0
                THEN ROUND((i.valor_actual / i.meta_global * 100)::numeric, 1)
                ELSE NULL END AS pct_meta
    FROM indicadores i
    WHERE i.activo = true
      AND (i.id_etapa = ANY($1) OR (i.id_etapa IS NULL AND i.id_proyecto = ANY($2)))
    ORDER BY i.nombre
  `, [etapaIdsAqui, proyectoIdsEncontrados]);

  const nodoIdsAqui = nodos.map(n => n.id);
  const { rows: riesgos } = nodoIdsAqui.length ? await pool.query(`
    SELECT r.titulo, r.descripcion, r.nivel, r.estado AS estado_riesgo,
           p.id::text AS id_proyecto
    FROM riesgos r
    JOIN proyectos p ON (
      (r.entidad_tipo = 'Etapa'  AND r.entidad_id IN (SELECT id FROM etapas WHERE id_proyecto = p.id)) OR
      (r.entidad_tipo = 'Accion' AND r.entidad_id IN (SELECT id FROM acciones WHERE id_proyecto = p.id))
    )
    WHERE r.entidad_id = ANY($1::uuid[])
      AND p.id = ANY($2)
      AND r.estado IN ('Abierto','En_mitigacion')
    ORDER BY CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END
    LIMIT 20
  `, [nodoIdsAqui, proyectoIdsEncontrados]) : { rows: [] };

  const { rows: venc } = await pool.query(`
    SELECT n.dias, n.nombre, n.id::text AS id_nodo, n.nombre_proyecto
    FROM (
      SELECT (e.fecha_fin::date - CURRENT_DATE)::int AS dias, e.nombre, e.id,
             p.nombre AS nombre_proyecto
      FROM etapas e JOIN proyectos p ON p.id = e.id_proyecto
      WHERE e.id_zm = $1 AND e.fecha_fin IS NOT NULL
        AND e.estado NOT IN ('Completada','Cancelada') AND e.id_proyecto = ANY($2)
      UNION ALL
      SELECT (COALESCE(a.fecha_limite,a.fecha_fin)::date - CURRENT_DATE)::int,
             a.nombre, a.id, p.nombre
      FROM acciones a JOIN proyectos p ON p.id = a.id_proyecto
      WHERE a.id_zm = $1 AND COALESCE(a.fecha_limite,a.fecha_fin) IS NOT NULL
        AND a.estado NOT IN ('Completada','Cancelada') AND a.id_proyecto = ANY($2)
    ) n
    WHERE n.dias <= 14
    ORDER BY n.dias
  `, [gidZm, proyectoIdsEncontrados]);

  const avancePromedio = proyMetrics.length
    ? Math.round(proyMetrics.reduce((s, p) => s + Number(p.avance), 0) / proyMetrics.length)
    : 0;

  return {
    cve_met: cveMet, gid: gidZm, nombre: nombreZm,
    num_proyectos: proyMetrics.length,
    num_etapas: nodos.filter(n => n.tipo === 'etapa').length,
    num_riesgos: riesgos.length,
    avance_promedio: avancePromedio,
    proyectos: proyMetrics.map(p => ({
      id: p.id, nombre: p.nombre, avance: Number(p.avance),
      num_etapas_aqui: Number(p.num_etapas_aqui) || 0, semaforo: p.semaforo,
    })),
    indicadores: indicadores.map(i => ({
      nombre: i.nombre, unidad: i.unidad_personalizada || i.unidad,
      meta_global: Number(i.meta_global), realizado: Number(i.realizado),
      pct_meta: i.pct_meta !== null ? Number(i.pct_meta) : null,
    })),
    etapas: nodos.map(n => ({
      id: n.id, tipo: n.tipo, nombre: n.nombre, nombre_padre: n.nombre_padre,
      id_proyecto: n.id_proyecto, nombre_proyecto: n.nombre_proyecto,
      estatus: n.estado, avance: Number(n.avance), semaforo: n.semaforo,
    })),
    riesgos: riesgos.map(r => ({
      titulo: r.titulo, descripcion: r.descripcion, nivel: r.nivel,
      estado: r.estado_riesgo, id_proyecto: r.id_proyecto,
    })),
    vencidos: venc.filter(v => v.dias < 0).map(v => ({
      dias: v.dias, nombre: v.nombre, id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto,
    })),
    por_vencer: venc.filter(v => v.dias >= 0).map(v => ({
      dias: v.dias, nombre: v.nombre, id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto,
    })),
  };
}

/**
 * Búsqueda global de municipios por nombre (para el buscador del módulo
 * Territorio). Usa pg_trgm; devuelve también el nombre del estado.
 */
async function buscarMunicipiosGeoFuzzy(texto) {
  const { rows } = await pool.query(`
    SELECT gm.cvegeo, gm.cve_ent, gm.nombre, ge.nombre AS nombre_estado,
           similarity(LOWER(gm.nombre), LOWER($1)) AS score
    FROM geo_municipios gm
    JOIN geo_estados ge ON ge.cve_ent = gm.cve_ent
    WHERE LOWER(gm.nombre) % LOWER($1) OR LOWER(gm.nombre) LIKE LOWER($1) || '%'
    ORDER BY score DESC
    LIMIT 8
  `, [texto]);
  return rows;
}

module.exports = {
  obtenerEstados,
  obtenerMunicipios,
  obtenerMunicipiosPorEstadoClave,
  obtenerZonasMetropolitanas,
  obtenerEstadosGeo,
  obtenerMunicipiosGeo,
  obtenerZMGeo,
  obtenerEstadosGeoJSON,
  obtenerMunicipiosGeoJSON,
  obtenerZMGeoJSON,
  obtenerMapaTerritorialProyecto,
  obtenerMapaIncidenciaGeo,
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
  obtenerDetalleEstado,
  obtenerMunicipiosActividadEstado,
  obtenerDetalleZM,
  buscarMunicipiosGeoFuzzy,
};
