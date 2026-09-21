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
const carterasQueries = require('../db/queries/carteras.queries');

async function alcanceProyectosUsuario(usuario) {
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') {
    const { rows } = await pool.query(
      // 'Cancelada' es el valor real (femenino, ver CHECK constraint de la
      // migración 011) — 'Cancelado' nunca fue un valor válido de esta
      // columna, así que ese filtro nunca excluía nada.
      "SELECT id FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelada'"
    );
    return rows.map(r => r.id);
  }
  return miembrosQueries.obtenerProyectosUsuario(usuario.id);
}

// Intersecta el alcance real del usuario con el filtro de
// proyecto(s)/cartera que venga en la query string — nunca lo amplía,
// ni siquiera para ejecutivo (para quien la intersección es un no-op,
// porque su alcance ya es "todos"). proyecto_ids y cartera_id son
// mutuamente excluyentes; si llegan los dos, gana cartera_id. Extraído
// de inicio.controller.js para reusarse también en el módulo de
// Indicadores — mismo criterio de filtro, misma fuente.
async function resolverProyectoIdsFiltro(usuario, query) {
  let proyectoIds = await alcanceProyectosUsuario(usuario);
  const { proyecto_ids: proyectoIdsQuery, cartera_id: carteraIdQuery } = query;
  if (carteraIdQuery) {
    const idsCartera = new Set(await carterasQueries.obtenerProyectoIdsDeCartera(carteraIdQuery));
    proyectoIds = proyectoIds.filter(id => idsCartera.has(id));
  } else if (proyectoIdsQuery) {
    const pedidos = new Set(String(proyectoIdsQuery).split(',').map(s => s.trim()).filter(Boolean));
    proyectoIds = proyectoIds.filter(id => pedidos.has(id));
  }
  return proyectoIds;
}

module.exports = { alcanceProyectosUsuario, resolverProyectoIdsFiltro };
