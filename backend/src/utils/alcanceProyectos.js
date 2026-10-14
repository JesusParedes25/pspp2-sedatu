/**
 * ARCHIVO: alcanceProyectos.js
 * PROPÓSITO: A qué proyectos tiene acceso un usuario en las vistas
 *            personalizadas (Tablero, dashboard, mapas por DG/estado,
 *            Mis indicadores, Documentos) — superadmin/ejecutivo ven
 *            todos los proyectos activos; `direccion` ve los suyos más
 *            el bono de DG (sección 9.1 de docs/modelo-permisos.md);
 *            cualquier otro rol (`enlace`) solo los que ya le pertenecen.
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
 *
 * EL BONO DE DG (Fase 2 / Paso 2, docs/modelo-permisos.md sección 9.1):
 * un usuario `direccion` recibe la UNIÓN de exactamente dos conjuntos —
 * (1) los proyectos donde participa, igual que cualquier otro perfil, y
 * (2) los proyectos cuya `id_dg_lider` es la propia `usuario.id_dg`,
 * participe o no. Nada más — en particular, NO se amplía por que un
 * tercero de su misma DG participe en un proyecto de OTRA DG: el bono se
 * resuelve comparando `proyectos.id_dg_lider` contra `usuario.id_dg`
 * directamente, nunca cruzando `proyecto_usuarios`/`nodo_miembros` de
 * nadie más. Null-safe: un `direccion` sin `id_dg` asignada no gana nada
 * de más, se queda solo con su participación real.
 */
const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');
const carterasQueries = require('../db/queries/carteras.queries');

async function proyectosDeLaDG(idDg) {
  const { rows } = await pool.query(
    "SELECT id FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelada' AND id_dg_lider = $1",
    [idDg]
  );
  return rows.map(r => r.id);
}

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

  const propios = await miembrosQueries.obtenerProyectosUsuario(usuario.id);
  if (usuario.rol === 'direccion' && usuario.id_dg) {
    const deSuDG = await proyectosDeLaDG(usuario.id_dg);
    return Array.from(new Set([...propios, ...deSuDG]));
  }
  return propios;
}

// Misma regla que alcanceProyectosUsuario, pero devolviendo null (en vez
// de la lista concreta de proyectos no cancelados) para superadmin/
// ejecutivo — para los consumidores cuya SQL ya distingue "sin filtro en
// absoluto" de "una lista de ids" (ver obtenerDetalleEstado y similares
// en geografia.queries.js, que con null se saltan la condición
// `AND p.id = ANY($n)` por completo en vez de recibir una lista enorme).
// Para cualquier otro rol delega en alcanceProyectosUsuario — un único
// lugar donde vive el bono de DG, nunca duplicado entre esta función y
// la de arriba.
//
// Punto de consolidación (Fase 1 del modelo de permisos, docs/modelo-permisos.md
// sección 6.3): antes existían TRES implementaciones independientes de
// "a qué proyectos tiene acceso este usuario", que no coincidían para
// 'direccion' — geo.controller.js::resolverProyectoIds y
// evidencias.controller.js::resolverProyectoIdsAcceso ahora son ambos un
// alias de esta única función.
async function alcanceProyectosUsuarioONull(usuario) {
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return null;
  return alcanceProyectosUsuario(usuario);
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

module.exports = { alcanceProyectosUsuario, alcanceProyectosUsuarioONull, resolverProyectoIdsFiltro };
