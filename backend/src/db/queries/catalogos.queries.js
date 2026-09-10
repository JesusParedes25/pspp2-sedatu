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

// Lista usuarios con filtros: DG, DA, nombre, excluir proyecto
async function obtenerUsuarios(idDg, opciones = {}) {
  const { id_direccion_area, nombre, excluir_proyecto } = opciones;
  const condiciones = ['u.activo = true'];
  const parametros = [];

  if (idDg) {
    parametros.push(idDg);
    condiciones.push(`u.id_dg = $${parametros.length}`);
  }
  if (id_direccion_area) {
    parametros.push(id_direccion_area);
    condiciones.push(`u.id_direccion_area = $${parametros.length}`);
  }
  if (nombre) {
    parametros.push(`%${nombre}%`);
    condiciones.push(`u.nombre_completo ILIKE $${parametros.length}`);
  }
  if (excluir_proyecto) {
    parametros.push(excluir_proyecto);
    condiciones.push(`u.id NOT IN (SELECT id_usuario FROM proyecto_usuarios WHERE id_proyecto = $${parametros.length})`);
  }

  const resultado = await pool.query(`
    SELECT
      u.id, u.nombre_completo, u.correo, u.cargo, u.rol, u.id_dg,
      dg.nombre AS dg_nombre, dg.siglas AS dg_siglas,
      u.id_direccion_area, da.nombre AS da_nombre, da.siglas AS direccion_area_siglas
    FROM usuarios u
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
    WHERE ${condiciones.join(' AND ')}
    ORDER BY u.nombre_completo
    LIMIT 100
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

// Sugerencias de etiquetas ya usadas en algún proyecto, para autocompletar
// mientras se escribe (evita duplicados por variación: "Vivienda" vs
// "vivienda" vs "VIVIENDA" quedan como una sola sugerencia gracias al
// DISTINCT + ILIKE insensible a mayúsculas). Solo de proyectos no
// eliminados — mismo criterio que el resto de la app para excluir Papelera
// de los agregados.
async function buscarEtiquetas(q, limite = 10) {
  const resultado = await pool.query(`
    SELECT DISTINCT et.nombre
    FROM etiquetas et
    JOIN proyectos p ON p.id = et.id_proyecto AND p.deleted_at IS NULL
    WHERE et.nombre ILIKE $1
    ORDER BY et.nombre
    LIMIT $2
  `, [`%${q}%`, limite]);
  return resultado.rows.map(r => r.nombre);
}

module.exports = {
  obtenerDGs,
  obtenerUsuarios,
  obtenerProgramas,
  obtenerDireccionesArea,
  buscarEtiquetas
};
