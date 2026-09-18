/**
 * ARCHIVO: alcanceProyectos.js
 * PROPÓSITO: A qué proyectos tiene acceso un usuario para el Tablero
 *            (/inicio y /inicio/mapa*) — superadmin/ejecutivo ven todos
 *            los proyectos activos, cualquier otro rol solo los que ya
 *            le pertenecen.
 *
 * Antes este mismo bloque vivía duplicado tal cual en
 * inicio.controller.js y en geo.controller.js (obtenerMapaInicio y
 * obtenerMapaZmInicio) — se extrae aquí para que los tres partan de la
 * misma fuente. Siempre devuelve un arreglo concreto (nunca null): las
 * queries que lo consumen (inicio.queries.js, geografia.queries.js
 * obtenerMapaIncidenciaGeo*) esperan un arreglo de verdad, no un
 * centinela "sin restricción" — eso es distinto del `resolverProyectoIds`
 * que ya existe en geo.controller.js para los endpoints de drill-down
 * territorial (esos sí soportan `null` = sin restricción en su propia
 * query); no se tocan ni se unifican, son dos contratos distintos.
 */
const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');

async function alcanceProyectosUsuario(usuario) {
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') {
    const { rows } = await pool.query(
      "SELECT id FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelado'"
    );
    return rows.map(r => r.id);
  }
  return miembrosQueries.obtenerProyectosUsuario(usuario.id);
}

module.exports = { alcanceProyectosUsuario };
