/**
 * ARCHIVO: geografia.queries.js
 * PROPÓSITO: Queries para catálogo geográfico y cobertura.
 */
const pool = require('../pool');
const { semaforoEfectivo } = require('../../utils/avance-semaforo');

// Mismo criterio que la lista de Vencimientos de obtenerDetalleEstado/ZM
// (fecha límite ya pasada y el nodo no se cerró) — centralizado aquí para
// que el filtro "Solo lo vencido" del mapa (frontend) pueda leerlo desde
// cualquier nivel (estado, ZM o municipio) con la misma regla.
function esVencido(estado, fechaLimite) {
  if (['Completada', 'Cancelada'].includes(estado) || !fechaLimite) return false;
  return new Date(fechaLimite) < new Date(new Date().toDateString());
}

// es_contenedor por nodo — para que el panel del mapa sepa si "Registrar
// avance" debe abrir con el avance bloqueado (se calcula de las partes) o
// editable, MISMO criterio que ya usa Seguimiento (PanelDetalle.jsx:
// `tipo === 'etapa' || data.es_hoja === false`, con es_hoja viniendo de
// esNodoHoja en avance-semaforo.js). Etapa es contenedor siempre, por
// definición del dominio; Tarea nunca lo es; Acción depende de si tiene
// subacciones o tareas propias — eso es lo único que hace falta
// averiguar aquí, en una sola consulta por lote en vez de una por nodo
// (esNodoHoja ya existe pero es por id, uno a la vez).
async function obtenerAccionesConHijos(accionIds) {
  if (!accionIds.length) return new Set();
  const { rows } = await pool.query(`
    SELECT DISTINCT id_padre FROM (
      SELECT id_accion_padre AS id_padre FROM acciones WHERE id_accion_padre = ANY($1)
      UNION ALL
      SELECT id_accion AS id_padre FROM tareas WHERE id_accion = ANY($1)
    ) x
  `, [accionIds]);
  return new Set(rows.map(r => r.id_padre));
}

function esContenedorNodo(tipo, id, accionesConHijos) {
  if (tipo === 'etapa') return true;
  if (tipo === 'accion') return accionesConHijos.has(id);
  return false;
}

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

// A qué nodo/proyecto pertenece una fila de cobertura — la ruta DELETE
// solo recibe el id de la fila, no el nodo, así que el controller
// necesita esto para verificar permiso ANTES de borrar.
async function obtenerCoberturaPorId(id) {
  const { rows } = await pool.query(
    'SELECT id, tipo_entidad, id_entidad FROM cobertura_geografica WHERE id = $1',
    [id]
  );
  return rows[0] || null;
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
        OR (cg.tipo_entidad = 'tarea' AND cg.id_entidad IN (
              SELECT t.id FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_proyecto = $1))
     ORDER BY ef.nombre, m.nombre`,
    [idProyecto]
  );
  return rows;
}

/**
 * Drill-down territorial: dado un id_estado, devuelve TODAS las acciones
 * de TODOS los proyectos que tienen cobertura en ese estado, agrupadas
 * por proyecto y etapa. Incluye riesgos e indicadores publicables.
 *
 * `alcanceProyectoIds` (Fase 2 / Paso 2, docs/modelo-permisos.md sección
 * 7.4) es el alcance real del usuario (null = sin restricción); solo se
 * filtra la query de acciones — riesgos e indicadores de abajo heredan
 * la restricción automáticamente porque solo consideran los proyecto_id
 * que ya salieron de esa primera query filtrada. `filtros.id_dg` sigue
 * siendo un filtro de conveniencia que solo acota DENTRO de ese alcance.
 */
async function obtenerResumenTerritorial(idEstado, filtros = {}, alcanceProyectoIds = null) {
  const params = [idEstado];
  const condiciones = [];
  if (alcanceProyectoIds !== null) {
    params.push(alcanceProyectoIds);
    condiciones.push(`p.id = ANY($${params.length})`);
  }
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    condiciones.push(`p.id_dg_lider = $${params.length}`);
  }
  const filtroExtra = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';

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
    JOIN proyectos p ON a.id_proyecto = p.id AND p.deleted_at IS NULL
    LEFT JOIN etapas e ON a.id_etapa = e.id
    LEFT JOIN direcciones_generales dg ON p.id_dg_lider = dg.id
    LEFT JOIN cat_municipios m ON cg.id_municipio = m.id
    WHERE cg.id_estado = $1 AND a.estado != 'Cancelada' ${filtroExtra}
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
        AND p.id = ANY($1) AND p.deleted_at IS NULL
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
      JOIN proyectos p ON p.id = i.id_proyecto AND p.deleted_at IS NULL
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
 * Resumen para el mapa: conteo de acciones por estado para colorear
 * coropletas. `alcanceProyectoIds` (Fase 2 / Paso 2) es el alcance real
 * del usuario (null = sin restricción); `filtros.id_dg` solo acota
 * DENTRO de ese alcance.
 */
async function obtenerResumenPorEstados(filtros = {}, alcanceProyectoIds = null) {
  const params = [];
  const condiciones = [];
  if (alcanceProyectoIds !== null) {
    params.push(alcanceProyectoIds);
    condiciones.push(`p.id = ANY($${params.length})`);
  }
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    condiciones.push(`p.id_dg_lider = $${params.length}`);
  }
  const filtroExtra = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';

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
    JOIN proyectos p ON a.id_proyecto = p.id AND p.deleted_at IS NULL
    WHERE a.estado != 'Cancelada' ${filtroExtra}
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
  // Territorio.js documenta el modelo: un nodo se territorializa en Modo A
  // (Estado + Municipios, cve_ent) O Modo B (Zona Metropolitana, id_zm) —
  // son mutuamente excluyentes (TerritorioSelector.jsx borra uno al elegir
  // el otro), nunca los dos a la vez. El WHERE de aquí solo pedía cve_ent
  // IS NOT NULL, así que un nodo territorializado por ZM (cve_ent siempre
  // NULL en ese modo) quedaba fuera del mapa del proyecto por completo —no
  // es que faltara una capa, el nodo ni siquiera entraba a la consulta.
  const { rows } = await pool.query(`
    WITH nodos AS (
      SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
             e.estado, e.semaforo, e.semaforo_override, e.prioridad,
             e.fecha_limite, e.fecha_fin,
             COALESCE(e.avance_actual, e.porcentaje_calculado::int, 0) AS avance,
             e.cve_ent, e.id_zm,
             COALESCE((SELECT array_agg(em.cve_mun) FROM etapa_municipios em WHERE em.etapa_id = e.id), '{}') AS cvegeos
      FROM etapas e
      WHERE e.id_proyecto = $1 AND (e.cve_ent IS NOT NULL OR e.id_zm IS NOT NULL)
      UNION ALL
      SELECT CASE WHEN a.id_accion_padre IS NOT NULL THEN 'tarea' ELSE 'accion' END,
             a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
             a.estado, a.semaforo, a.semaforo_override, a.prioridad,
             a.fecha_limite, a.fecha_fin,
             COALESCE(a.avance_actual, 0) AS avance,
             a.cve_ent, a.id_zm,
             COALESCE((SELECT array_agg(am.cve_mun) FROM accion_municipios am WHERE am.accion_id = a.id), '{}') AS cvegeos
      FROM acciones a
      LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
      LEFT JOIN etapas et ON et.id = a.id_etapa
      WHERE a.id_proyecto = $1 AND (a.cve_ent IS NOT NULL OR a.id_zm IS NOT NULL)
    )
    SELECT n.tipo, n.id, n.nombre, n.nombre_padre, n.estado, n.semaforo,
           n.semaforo_override, n.prioridad, n.fecha_limite, n.fecha_fin,
           n.avance, n.cve_ent, n.id_zm, n.cvegeos,
           gs.nombre AS nombre_estado, gz.nombre AS nombre_zm, gz.cve_met
    FROM nodos n
    LEFT JOIN geo_estados gs ON gs.cve_ent = n.cve_ent
    LEFT JOIN geo_zm gz ON gz.gid = n.id_zm
    ORDER BY COALESCE(gs.nombre, gz.nombre), n.tipo, n.nombre
  `, [proyectoId]);

  const porEstado = {};
  const porZM = {};
  const todosCvegeos = new Set();
  for (const r of rows) {
    const cvegeos = r.cvegeos || [];
    const nodo = {
      tipo: r.tipo, id: r.id, nombre: r.nombre, nombre_padre: r.nombre_padre,
      estado: r.estado, semaforo: r.semaforo,
      // Mismo cálculo que ya gobierna los puntos de color del árbol de
      // Seguimiento (avance-semaforo.js) — antes este mapa mostraba el
      // campo crudo `semaforo`, que solo tiene valor cuando alguien lo
      // fijó a mano; sin override, casi siempre estaba vacío y el punto
      // se veía gris aunque el nodo tuviera un semáforo calculado real.
      semaforo_efectivo: semaforoEfectivo(r),
      avance: parseFloat(r.avance) || 0, cvegeos,
    };
    if (r.cve_ent) {
      if (!porEstado[r.cve_ent]) {
        porEstado[r.cve_ent] = { cve_ent: r.cve_ent, nombre_estado: r.nombre_estado, nodos: [] };
      }
      porEstado[r.cve_ent].nodos.push(nodo);
      for (const cg of cvegeos) todosCvegeos.add(cg);
    } else if (r.id_zm) {
      if (!porZM[r.id_zm]) {
        porZM[r.id_zm] = { gid: r.id_zm, cve_met: r.cve_met, nombre_zm: r.nombre_zm, nodos: [] };
      }
      porZM[r.id_zm].nodos.push(nodo);
    }
  }

  return {
    por_estado: Object.values(porEstado),
    por_zm: Object.values(porZM),
    cvegeos: [...todosCvegeos],
  };
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
      -- Un nodo puede tener municipios de estados distintos a su cve_ent
      -- "principal" (desde que se permite territorio multi-estado) — hay
      -- que contarlo en cada estado que realmente cubre, no solo en uno.
      UNION
      SELECT DISTINCT LEFT(em.cve_mun, 2), e.id_proyecto
      FROM etapa_municipios em JOIN etapas e ON e.id = em.etapa_id
      WHERE e.id_proyecto = ANY($1)
      UNION
      SELECT DISTINCT LEFT(am.cve_mun, 2), a.id_proyecto
      FROM accion_municipios am JOIN acciones a ON a.id = am.accion_id
      WHERE a.id_proyecto = ANY($1)
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

// Mismo resumen que obtenerMapaIncidenciaGeo pero agrupado por Zona
// Metropolitana (id_zm) en vez de estado — alimenta el hover/intensidad
// del mapa en modo "Zonas Metropolitanas". Antes no existía, por lo que
// el tooltip de esa vista siempre mostraba "Sin actividad" aunque sí
// hubiera etapas/acciones asignadas a la ZM (el guardado funcionaba, solo
// no había de dónde leerlo para el resumen del mapa).
async function obtenerMapaIncidenciaGeoZM(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    WITH nodos_proyectos AS (
      SELECT DISTINCT e.id_zm, e.id_proyecto
      FROM etapas e WHERE e.id_proyecto = ANY($1) AND e.id_zm IS NOT NULL
      UNION
      SELECT DISTINCT a.id_zm, a.id_proyecto
      FROM acciones a WHERE a.id_proyecto = ANY($1) AND a.id_zm IS NOT NULL
    ),
    por_zm AS (
      SELECT np.id_zm, gz.nombre AS nombre_zm,
             json_agg(json_build_object('id', p.id, 'nombre', p.nombre) ORDER BY p.nombre) AS proyectos
      FROM nodos_proyectos np
      JOIN proyectos p ON p.id = np.id_proyecto
      JOIN geo_zm gz ON gz.gid = np.id_zm
      GROUP BY np.id_zm, gz.nombre
    )
    SELECT id_zm AS gid, nombre_zm, proyectos
    FROM por_zm
    ORDER BY nombre_zm
  `, [proyectoIds]);
  return rows;
}

// Severidad para "el peor semáforo de este estado/ZM" — no existe en
// ningún otro lugar del backend (se buscó antes de escribirla), así que
// vive aquí junto a quien la usa. No reemplaza ni reinterpreta
// semaforoEfectivo (ese sigue siendo el único cálculo real): solo ordena
// sus 4 resultados posibles para quedarse con el más urgente del grupo.
const SEVERIDAD_SEMAFORO = { rojo: 3, ambar: 2, verde: 1, gris: 0 };

function peorSemaforo(nodos) {
  let peor = null;
  for (const n of nodos) {
    const sem = semaforoEfectivo({
      estado: n.estado, semaforo: n.semaforo, semaforo_override: n.semaforo_override,
      prioridad: n.prioridad, fecha_limite: n.fecha_limite, fecha_fin: n.fecha_limite,
    });
    if (!peor || SEVERIDAD_SEMAFORO[sem] > SEVERIDAD_SEMAFORO[peor]) peor = sem;
  }
  return peor || 'gris';
}

// Mismo alcance de nodos que obtenerMapaIncidenciaGeo (etapas/acciones con
// cve_ent directo o vía municipio) pero trayendo lo necesario para calcular
// el semáforo de cada uno con la MISMA función que ya usa todo lo demás
// (semaforoEfectivo, avance-semaforo.js) — sin tocarla ni reimplementar su
// regla en SQL. Para el selector de coloreado del mapa en modo "Urgencia"
// (ver MapaTerritorial.jsx) — alternativa a "Proyectos por estado", que
// hoy no distingue un estado con 4 proyectos a tiempo de uno con 4
// proyectos vencidos.
async function obtenerUrgenciaPorEstado(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT cve_ent, estado, semaforo, semaforo_override, prioridad, fecha_limite FROM (
      SELECT e.cve_ent, e.estado, e.semaforo, e.semaforo_override, e.prioridad, e.fecha_fin AS fecha_limite
      FROM etapas e WHERE e.id_proyecto = ANY($1) AND e.cve_ent IS NOT NULL
      UNION ALL
      SELECT LEFT(em.cve_mun, 2), e.estado, e.semaforo, e.semaforo_override, e.prioridad, e.fecha_fin
      FROM etapa_municipios em JOIN etapas e ON e.id = em.etapa_id WHERE e.id_proyecto = ANY($1)
      UNION ALL
      SELECT a.cve_ent, a.estado, a.semaforo, a.semaforo_override, a.prioridad, COALESCE(a.fecha_limite, a.fecha_fin)
      FROM acciones a WHERE a.id_proyecto = ANY($1) AND a.cve_ent IS NOT NULL
      UNION ALL
      SELECT LEFT(am.cve_mun, 2), a.estado, a.semaforo, a.semaforo_override, a.prioridad, COALESCE(a.fecha_limite, a.fecha_fin)
      FROM accion_municipios am JOIN acciones a ON a.id = am.accion_id WHERE a.id_proyecto = ANY($1)
    ) n
  `, [proyectoIds]);

  const porEstado = {};
  for (const r of rows) (porEstado[r.cve_ent] ||= []).push(r);
  return Object.entries(porEstado).map(([cve_ent, nodos]) => ({ cve_ent, semaforo_peor: peorSemaforo(nodos) }));
}

// Mismo criterio que obtenerUrgenciaPorEstado pero por ZM — mismo alcance
// de nodos que obtenerMapaIncidenciaGeoZM (solo id_zm directo, sin
// expandir por municipio: ver esa función).
async function obtenerUrgenciaPorZM(proyectoIds) {
  if (!proyectoIds || proyectoIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT id_zm, estado, semaforo, semaforo_override, prioridad, fecha_limite FROM (
      SELECT e.id_zm, e.estado, e.semaforo, e.semaforo_override, e.prioridad, e.fecha_fin AS fecha_limite
      FROM etapas e WHERE e.id_proyecto = ANY($1) AND e.id_zm IS NOT NULL
      UNION ALL
      SELECT a.id_zm, a.estado, a.semaforo, a.semaforo_override, a.prioridad, COALESCE(a.fecha_limite, a.fecha_fin)
      FROM acciones a WHERE a.id_proyecto = ANY($1) AND a.id_zm IS NOT NULL
    ) n
  `, [proyectoIds]);

  const porZm = {};
  for (const r of rows) (porZm[r.id_zm] ||= []).push(r);
  return Object.entries(porZm).map(([gid, nodos]) => ({ gid, semaforo_peor: peorSemaforo(nodos) }));
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

  // 1. Nodos (etapas + acciones + tareas) en ese estado. id_etapa/etapa_nombre
  // en cada rama son para que el frontend pueda agrupar de forma confiable
  // bajo la etapa dueña aunque la etapa misma no tenga cobertura aquí (un
  // hijo puede aparecer sin su padre presente). La rama de acciones ya
  // cubre subacciones (acciones.id_etapa vive directo en cada fila, sin
  // recorrer id_accion_padre) — 'tarea' ya no es un alias de subacción,
  // significa una fila real de la tabla tareas.
  const { rows: nodos } = await pool.query(`
    SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
           NULL::text AS id_padre,
           e.id::text AS id_etapa, e.nombre AS etapa_nombre,
           e.estado, e.semaforo, e.semaforo_override, e.prioridad,
           COALESCE(e.avance_actual, 0)::int AS avance,
           e.fecha_fin AS fecha_limite,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE (e.cve_ent = $1 OR EXISTS (
      SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = e.id AND LEFT(em.cve_mun, 2) = $1
    )) ${filtroProyecto}
    UNION ALL
    SELECT 'accion'::text, a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
           a.id_accion_padre::text,
           a.id_etapa::text, et.nombre,
           a.estado, a.semaforo, a.semaforo_override, a.prioridad,
           COALESCE(a.avance_actual, 0)::int,
           COALESCE(a.fecha_limite, a.fecha_fin),
           p.id::text, p.nombre
    FROM acciones a
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE (a.cve_ent = $1 OR EXISTS (
      SELECT 1 FROM accion_municipios am WHERE am.accion_id = a.id AND LEFT(am.cve_mun, 2) = $1
    )) ${filtroProyecto}
    UNION ALL
    SELECT 'tarea'::text, t.id::text, t.nombre, a.nombre,
           a.id::text,
           a.id_etapa::text, et.nombre,
           t.estado, t.semaforo, t.semaforo_override, t.prioridad,
           COALESCE(t.avance_actual, 0)::int,
           t.fecha_limite,
           p.id::text, p.nombre
    FROM tareas t
    JOIN acciones a ON a.id = t.id_accion
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE (t.cve_ent = $1 OR EXISTS (
      SELECT 1 FROM tarea_municipios tm WHERE tm.tarea_id = t.id AND LEFT(tm.cve_mun, 2) = $1
    )) ${filtroProyecto}
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
  const porProyectoAqui = {};
  for (const n of nodos) {
    if (!porProyectoAqui[n.id_proyecto]) {
      porProyectoAqui[n.id_proyecto] = { id: n.id_proyecto, nombre: n.nombre_proyecto, suma: 0, cuenta: 0, num_etapas_aqui: 0 };
    }
    const p = porProyectoAqui[n.id_proyecto];
    p.suma += Number(n.avance);
    p.cuenta++;
    // Antes solo contaba tipo==='etapa': el encabezado "Etapas/Acc." y esta
    // cifra por proyecto decían "aquí" pero dejaban fuera acciones y tareas
    // que SÍ aparecen en la lista de abajo (ver FilaNodo/BloqueEtapas) —
    // el contador no coincidía con lo que el usuario veía listado.
    p.num_etapas_aqui++;
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

  // 4. Indicadores reportados desde un nodo con cobertura en este estado:
  // suma de indicador_movimientos cuyo id_nodo_origen es una etapa/acción/
  // tarea de `nodos` (arriba). A diferencia de la versión anterior (que
  // mostraba indicadores.valor_actual, el total DEL PROYECTO COMPLETO, para
  // cualquier estado donde el proyecto tuviera presencia) esto es lo
  // genuinamente atribuible a este estado: un indicador sin ningún
  // movimiento reportado desde un nodo de aquí simplemente no aparece, en
  // vez de aparecer con el total nacional del proyecto como si fuera local.
  // pct_meta se deja siempre en null a propósito: comparar un numerador
  // parcial (solo este estado) contra la meta_global (todo el proyecto)
  // sería otra forma de atribución engañosa.
  const nodoIdsAqui = nodos.map(n => n.id);
  const { rows: indicadores } = nodoIdsAqui.length ? await pool.query(`
    SELECT i.id::text, i.nombre, i.unidad_personalizada, i.unidad,
           COALESCE(SUM(m.cantidad), 0) AS realizado_aqui
    FROM indicador_movimientos m
    JOIN indicadores i ON i.id = m.id_indicador AND i.activo = true
    WHERE m.id_nodo_origen = ANY($1::uuid[]) AND m.anulado_en IS NULL
    GROUP BY i.id, i.nombre, i.unidad_personalizada, i.unidad
    ORDER BY i.nombre
  `, [nodoIdsAqui]) : { rows: [] };

  // 5. Riesgos abiertos — solo los ligados directamente a una etapa/acción
  // presente en este estado (no riesgos de alcance "Proyecto" completo).
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

  // 6. Vencidos y por vencer (próximos 14 días). id_proyecto viaja desde aquí
  // (antes solo nombre_proyecto) para que el panel pueda enlazar cada
  // vencimiento a su nodo en Seguimiento.
  const { rows: venc } = await pool.query(`
    SELECT n.dias, n.nombre, n.id::text AS id_nodo, n.nombre_proyecto, n.id_proyecto
    FROM (
      SELECT (e.fecha_fin::date - CURRENT_DATE)::int AS dias, e.nombre, e.id,
             p.nombre AS nombre_proyecto, p.id::text AS id_proyecto
      FROM etapas e JOIN proyectos p ON p.id = e.id_proyecto
      WHERE (e.cve_ent = $1 OR EXISTS (
              SELECT 1 FROM etapa_municipios em WHERE em.etapa_id = e.id AND LEFT(em.cve_mun, 2) = $1
            )) AND e.fecha_fin IS NOT NULL
        AND e.estado NOT IN ('Completada','Cancelada') AND e.id_proyecto = ANY($2)
      UNION ALL
      SELECT (COALESCE(a.fecha_limite,a.fecha_fin)::date - CURRENT_DATE)::int,
             a.nombre, a.id, p.nombre, p.id::text
      FROM acciones a JOIN proyectos p ON p.id = a.id_proyecto
      WHERE (a.cve_ent = $1 OR EXISTS (
              SELECT 1 FROM accion_municipios am WHERE am.accion_id = a.id AND LEFT(am.cve_mun, 2) = $1
            )) AND COALESCE(a.fecha_limite,a.fecha_fin) IS NOT NULL
        AND a.estado NOT IN ('Completada','Cancelada') AND a.id_proyecto = ANY($2)
    ) n
    WHERE n.dias <= 14
    ORDER BY n.dias
  `, [cveEnt, proyectoIdsEncontrados]);

  const accionesConHijos = await obtenerAccionesConHijos(nodos.filter(n => n.tipo === 'accion').map(n => n.id));

  const avancePromedio = proyMetrics.length
    ? Math.round(proyMetrics.reduce((s, p) => s + Number(p.avance), 0) / proyMetrics.length)
    : 0;

  return {
    cve_ent: cveEnt,
    nombre: nombreEstado,
    num_proyectos: proyMetrics.length,
    // Antes solo contaba etapas (misma falla que num_etapas_aqui arriba);
    // ahora coincide con la lista `etapas` de abajo, que ya incluye acciones
    // y tareas.
    num_etapas: nodos.length,
    num_riesgos: riesgos.length,
    avance_promedio: avancePromedio,
    proyectos: proyMetrics.map(p => ({
      id: p.id, nombre: p.nombre,
      avance: Number(p.avance),
      num_etapas_aqui: Number(p.num_etapas_aqui) || 0,
      semaforo: p.semaforo,
    })),
    // realizado_aqui en vez de realizado+meta_global+pct_meta: ver nota en
    // el punto 4 de arriba sobre por qué esta vista nunca compara contra la
    // meta global del proyecto.
    indicadores: indicadores.map(i => ({
      id: i.id,
      nombre: i.nombre,
      unidad: i.unidad_personalizada || i.unidad,
      realizado_aqui: Number(i.realizado_aqui),
    })),
    etapas: nodos.map(n => ({
      id: n.id, tipo: n.tipo, nombre: n.nombre, nombre_padre: n.nombre_padre,
      id_padre: n.id_padre,
      id_etapa: n.id_etapa, etapa_nombre: n.etapa_nombre,
      id_proyecto: n.id_proyecto, nombre_proyecto: n.nombre_proyecto,
      estatus: n.estado, avance: Number(n.avance), semaforo: n.semaforo,
      semaforo_efectivo: semaforoEfectivo({
        estado: n.estado, semaforo: n.semaforo, semaforo_override: n.semaforo_override,
        prioridad: n.prioridad, fecha_limite: n.fecha_limite, fecha_fin: n.fecha_limite,
      }),
      vencido: esVencido(n.estado, n.fecha_limite),
      es_contenedor: esContenedorNodo(n.tipo, n.id, accionesConHijos),
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
      id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto, id_proyecto: v.id_proyecto,
    })),
    por_vencer: venc.filter(v => v.dias >= 0).map(v => ({
      dias: v.dias, nombre: v.nombre,
      id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto, id_proyecto: v.id_proyecto,
    })),
  };
}

/**
 * Actividad por municipio dentro de un estado, para el drill-down del mapa:
 * qué municipios tienen etapas/acciones asignadas (vía etapa_municipios/
 * accion_municipios — un nodo puede tener varios municipios, cada uno
 * genera su propia fila aquí).
 * Respeta el mismo esquema de acceso que obtenerDetalleEstado.
 */
async function obtenerMunicipiosActividadEstado(cveEnt, proyectoIds) {
  const filtroProyecto = proyectoIds === null ? '' : 'AND p.id = ANY($2)';
  const params = proyectoIds === null ? [cveEnt] : [cveEnt, proyectoIds];

  const { rows } = await pool.query(`
    SELECT em.cve_mun AS cvegeo, e.id::text, e.nombre,
           e.estado, e.semaforo, e.semaforo_override, e.prioridad,
           e.fecha_limite, e.fecha_fin,
           COALESCE(e.avance_actual, 0)::int AS avance,
           'etapa'::text AS tipo, NULL::text AS nombre_padre,
           NULL::text AS id_padre,
           e.id::text AS id_etapa, e.nombre AS etapa_nombre,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN etapa_municipios em ON em.etapa_id = e.id
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE LEFT(em.cve_mun, 2) = $1 ${filtroProyecto}
    UNION ALL
    SELECT am.cve_mun, a.id::text, a.nombre,
           a.estado, a.semaforo, a.semaforo_override, a.prioridad,
           a.fecha_limite, a.fecha_fin,
           COALESCE(a.avance_actual, 0)::int,
           'accion'::text,
           COALESCE(padre.nombre, et.nombre),
           a.id_accion_padre::text,
           a.id_etapa::text, et.nombre,
           p.id::text, p.nombre
    FROM acciones a
    JOIN accion_municipios am ON am.accion_id = a.id
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN acciones padre ON padre.id = a.id_accion_padre
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE LEFT(am.cve_mun, 2) = $1 ${filtroProyecto}
    UNION ALL
    SELECT tm.cve_mun, t.id::text, t.nombre,
           t.estado, t.semaforo, t.semaforo_override, t.prioridad,
           t.fecha_limite, NULL::date AS fecha_fin,
           COALESCE(t.avance_actual, 0)::int,
           'tarea'::text,
           a.nombre,
           a.id::text,
           a.id_etapa::text, et.nombre,
           p.id::text, p.nombre
    FROM tareas t
    JOIN tarea_municipios tm ON tm.tarea_id = t.id
    JOIN acciones a ON a.id = t.id_accion
    JOIN proyectos p ON p.id = a.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN etapas et ON et.id = a.id_etapa
    WHERE LEFT(tm.cve_mun, 2) = $1 ${filtroProyecto}
    ORDER BY nombre
  `, params);

  const accionesConHijos = await obtenerAccionesConHijos(rows.filter(r => r.tipo === 'accion').map(r => r.id));

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
      id_padre: r.id_padre,
      id_etapa: r.id_etapa, etapa_nombre: r.etapa_nombre,
      estatus: r.estado, semaforo: r.semaforo, semaforo_efectivo: semaforoEfectivo(r), avance: Number(r.avance),
      id_proyecto: r.id_proyecto, nombre_proyecto: r.nombre_proyecto,
      // Aquí no existía ningún campo de fecha — sin esto, el filtro "Solo
      // lo vencido" del mapa no tenía de dónde leer a nivel municipio.
      vencido: esVencido(r.estado, r.fecha_limite || r.fecha_fin),
      es_contenedor: esContenedorNodo(r.tipo, r.id, accionesConHijos),
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

  // Sin rama de tareas a propósito: tareas no tiene id_zm (ver comentario de
  // la migración 064), así que no hay forma de ubicar una tarea dentro de
  // una ZM — solo aplica a nivel estado/municipio (obtenerDetalleEstado /
  // obtenerMunicipiosActividadEstado).
  const { rows: nodos } = await pool.query(`
    SELECT 'etapa'::text AS tipo, e.id::text, e.nombre, NULL::text AS nombre_padre,
           NULL::text AS id_padre,
           e.id::text AS id_etapa, e.nombre AS etapa_nombre,
           e.estado, e.semaforo, e.semaforo_override, e.prioridad,
           COALESCE(e.avance_actual, 0)::int AS avance,
           e.fecha_fin AS fecha_limite,
           p.id::text AS id_proyecto, p.nombre AS nombre_proyecto
    FROM etapas e
    JOIN proyectos p ON p.id = e.id_proyecto AND p.deleted_at IS NULL
    WHERE e.id_zm = $1 ${filtroProyecto}
    UNION ALL
    SELECT 'accion'::text,
           a.id::text, a.nombre, COALESCE(padre.nombre, et.nombre),
           a.id_accion_padre::text,
           a.id_etapa::text, et.nombre,
           a.estado, a.semaforo, a.semaforo_override, a.prioridad,
           COALESCE(a.avance_actual, 0)::int,
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
  const porProyectoAqui = {};
  for (const n of nodos) {
    if (!porProyectoAqui[n.id_proyecto]) {
      porProyectoAqui[n.id_proyecto] = { id: n.id_proyecto, nombre: n.nombre_proyecto, suma: 0, cuenta: 0, num_etapas_aqui: 0 };
    }
    const p = porProyectoAqui[n.id_proyecto];
    p.suma += Number(n.avance);
    p.cuenta++;
    // Antes solo contaba tipo==='etapa' — ver el mismo fix en obtenerDetalleEstado.
    p.num_etapas_aqui++;
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

  // Indicadores atribuidos a esta ZM: mismo criterio que obtenerDetalleEstado
  // (sumar indicador_movimientos reportados desde un nodo de aquí, sin
  // comparar contra la meta global) — ver la nota ahí.
  const nodoIdsAqui = nodos.map(n => n.id);
  const { rows: indicadores } = nodoIdsAqui.length ? await pool.query(`
    SELECT i.id::text, i.nombre, i.unidad_personalizada, i.unidad,
           COALESCE(SUM(m.cantidad), 0) AS realizado_aqui
    FROM indicador_movimientos m
    JOIN indicadores i ON i.id = m.id_indicador AND i.activo = true
    WHERE m.id_nodo_origen = ANY($1::uuid[]) AND m.anulado_en IS NULL
    GROUP BY i.id, i.nombre, i.unidad_personalizada, i.unidad
    ORDER BY i.nombre
  `, [nodoIdsAqui]) : { rows: [] };

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
    SELECT n.dias, n.nombre, n.id::text AS id_nodo, n.nombre_proyecto, n.id_proyecto
    FROM (
      SELECT (e.fecha_fin::date - CURRENT_DATE)::int AS dias, e.nombre, e.id,
             p.nombre AS nombre_proyecto, p.id::text AS id_proyecto
      FROM etapas e JOIN proyectos p ON p.id = e.id_proyecto
      WHERE e.id_zm = $1 AND e.fecha_fin IS NOT NULL
        AND e.estado NOT IN ('Completada','Cancelada') AND e.id_proyecto = ANY($2)
      UNION ALL
      SELECT (COALESCE(a.fecha_limite,a.fecha_fin)::date - CURRENT_DATE)::int,
             a.nombre, a.id, p.nombre, p.id::text
      FROM acciones a JOIN proyectos p ON p.id = a.id_proyecto
      WHERE a.id_zm = $1 AND COALESCE(a.fecha_limite,a.fecha_fin) IS NOT NULL
        AND a.estado NOT IN ('Completada','Cancelada') AND a.id_proyecto = ANY($2)
    ) n
    WHERE n.dias <= 14
    ORDER BY n.dias
  `, [gidZm, proyectoIdsEncontrados]);

  const accionesConHijos = await obtenerAccionesConHijos(nodos.filter(n => n.tipo === 'accion').map(n => n.id));

  const avancePromedio = proyMetrics.length
    ? Math.round(proyMetrics.reduce((s, p) => s + Number(p.avance), 0) / proyMetrics.length)
    : 0;

  return {
    cve_met: cveMet, gid: gidZm, nombre: nombreZm,
    num_proyectos: proyMetrics.length,
    num_etapas: nodos.length,
    num_riesgos: riesgos.length,
    avance_promedio: avancePromedio,
    proyectos: proyMetrics.map(p => ({
      id: p.id, nombre: p.nombre, avance: Number(p.avance),
      num_etapas_aqui: Number(p.num_etapas_aqui) || 0, semaforo: p.semaforo,
    })),
    indicadores: indicadores.map(i => ({
      id: i.id,
      nombre: i.nombre, unidad: i.unidad_personalizada || i.unidad,
      realizado_aqui: Number(i.realizado_aqui),
    })),
    etapas: nodos.map(n => ({
      id: n.id, tipo: n.tipo, nombre: n.nombre, nombre_padre: n.nombre_padre,
      id_padre: n.id_padre,
      id_etapa: n.id_etapa, etapa_nombre: n.etapa_nombre,
      id_proyecto: n.id_proyecto, nombre_proyecto: n.nombre_proyecto,
      estatus: n.estado, avance: Number(n.avance), semaforo: n.semaforo,
      semaforo_efectivo: semaforoEfectivo({
        estado: n.estado, semaforo: n.semaforo, semaforo_override: n.semaforo_override,
        prioridad: n.prioridad, fecha_limite: n.fecha_limite, fecha_fin: n.fecha_limite,
      }),
      vencido: esVencido(n.estado, n.fecha_limite),
      es_contenedor: esContenedorNodo(n.tipo, n.id, accionesConHijos),
    })),
    riesgos: riesgos.map(r => ({
      titulo: r.titulo, descripcion: r.descripcion, nivel: r.nivel,
      estado: r.estado_riesgo, id_proyecto: r.id_proyecto,
    })),
    vencidos: venc.filter(v => v.dias < 0).map(v => ({
      dias: v.dias, nombre: v.nombre, id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto, id_proyecto: v.id_proyecto,
    })),
    por_vencer: venc.filter(v => v.dias >= 0).map(v => ({
      dias: v.dias, nombre: v.nombre, id_nodo: v.id_nodo, nombre_proyecto: v.nombre_proyecto, id_proyecto: v.id_proyecto,
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
  obtenerMapaIncidenciaGeoZM,
  obtenerUrgenciaPorEstado,
  obtenerUrgenciaPorZM,
  buscarEstadoPorNombre,
  buscarMunicipioPorNombre,
  buscarEstadosFuzzy,
  buscarMunicipiosFuzzy,
  obtenerCobertura,
  obtenerCoberturaPorId,
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
