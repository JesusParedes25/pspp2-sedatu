/**
 * ARCHIVO: geografia.queries.js
 * PROPÓSITO: Queries para catálogo geográfico y cobertura.
 */
const pool = require('../pool');

// ─── Catálogo ─────────────────────────────────────────────────

async function obtenerEstados() {
  const { rows } = await pool.query(
    'SELECT id, clave, nombre FROM cat_entidades_federativas ORDER BY nombre'
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

module.exports = {
  obtenerEstados,
  obtenerMunicipios,
  buscarEstadoPorNombre,
  buscarMunicipioPorNombre,
  buscarEstadosFuzzy,
  buscarMunicipiosFuzzy,
  obtenerCobertura,
  agregarCobertura,
  eliminarCobertura,
  obtenerCoberturaProyecto,
};
