/**
 * ARCHIVO: catalogos.queries.js
 * PROPÓSITO: Queries SQL para catálogos del sistema (DGs, usuarios, programas, etc.).
 *
 * MINI-CLASE: Catálogos como datos de referencia
 * ─────────────────────────────────────────────────────────────────
 * Los catálogos son tablas de referencia que rara vez cambian:
 * direcciones generales, programas, direcciones de área. El frontend
 * los consume para poblar selects y filtros. Estas queries son
 * simples SELECT sin lógica de negocio. Se cachean en el frontend
 * para evitar peticiones repetitivas al servidor.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Lista todas las DGs activas con su subsecretaría
async function obtenerDGs() {
  const resultado = await pool.query(`
    SELECT
      dg.id, dg.nombre, dg.siglas, dg.descripcion,
      ur.siglas AS unidad_responsable_siglas,
      s.siglas AS subsecretaria_siglas,
      s.nombre AS subsecretaria_nombre
    FROM direcciones_generales dg
    LEFT JOIN unidades_responsables ur ON ur.id = dg.id_unidad_responsable
    LEFT JOIN subsecretarias s ON s.id = ur.id_subsecretaria
    ORDER BY s.siglas, dg.siglas
  `);

  return resultado.rows;
}

// Lista usuarios, opcionalmente filtrados por DG
async function obtenerUsuarios(idDg) {
  const condiciones = ['u.activo = true'];
  const parametros = [];

  if (idDg) {
    condiciones.push('u.id_dg = $1');
    parametros.push(idDg);
  }

  const resultado = await pool.query(`
    SELECT
      u.id, u.nombre_completo, u.correo, u.cargo, u.rol, u.id_dg,
      dg.siglas AS dg_siglas,
      da.siglas AS direccion_area_siglas
    FROM usuarios u
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
    WHERE ${condiciones.join(' AND ')}
    ORDER BY u.nombre_completo
  `, parametros);

  return resultado.rows;
}

// Lista programas activos con unidad responsable y descripción
async function obtenerProgramas() {
  const resultado = await pool.query(`
    SELECT id, nombre, clave, tipo, ejercicio_fiscal,
           unidad_responsable, descripcion
    FROM programas
    WHERE activo = true
    ORDER BY clave
  `);

  return resultado.rows;
}

// Lista direcciones de área, opcionalmente filtradas por DG
async function obtenerDireccionesArea(idDg) {
  const condiciones = [];
  const parametros = [];

  if (idDg) {
    condiciones.push('da.id_dg = $1');
    parametros.push(idDg);
  }

  const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const resultado = await pool.query(`
    SELECT
      da.id, da.nombre, da.siglas,
      dg.siglas AS dg_siglas
    FROM direcciones_area da
    LEFT JOIN direcciones_generales dg ON dg.id = da.id_dg
    ${whereClause}
    ORDER BY dg.siglas, da.siglas
  `, parametros);

  return resultado.rows;
}

module.exports = {
  obtenerDGs,
  obtenerUsuarios,
  obtenerProgramas,
  obtenerDireccionesArea
};
