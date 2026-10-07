/**
 * ARCHIVO: descendientes-nodo.js
 * PROPÓSITO: Dado un nodo (etapa/acción/tarea), resolver los ids de todos
 *            sus descendientes en la jerarquía etapa → acción → subacción
 *            → tarea. Compartido por cualquier query que necesite agregar
 *            datos del subárbol (actividad, documentos, indicadores,
 *            riesgos) — un solo lugar para esta lógica, en vez de que cada
 *            módulo la repita a su manera.
 *
 * No es un WITH RECURSIVE: la jerarquía real tiene profundidad fija
 * (acciones.id_accion_padre es un solo nivel de auto-referencia, sin
 * anidado más profundo), así que dos consultas secuenciales bastan y es
 * el mismo patrón ya usado en actividad.queries.js antes de este archivo.
 */
const pool = require('../db/pool');

// { etapaIds, accionIds, tareaIds } — accionIds incluye tanto la acción
// propia como sus subacciones (misma tabla `acciones`, auto-referencia
// id_accion_padre).
async function idsDescendientes(tipoNodo, idNodo) {
  if (tipoNodo === 'tarea') return { etapaIds: [], accionIds: [], tareaIds: [idNodo] };

  if (tipoNodo === 'accion') {
    const { rows: sub } = await pool.query(
      'SELECT id FROM acciones WHERE id_accion_padre = $1', [idNodo]
    );
    const accionIds = [idNodo, ...sub.map(r => r.id)];
    const { rows: tareas } = await pool.query(
      'SELECT id FROM tareas WHERE id_accion = ANY($1)', [accionIds]
    );
    return { etapaIds: [], accionIds, tareaIds: tareas.map(r => r.id) };
  }

  // etapa
  const { rows: acc } = await pool.query('SELECT id FROM acciones WHERE id_etapa = $1', [idNodo]);
  const accionIds = acc.map(r => r.id);
  let subIds = [];
  if (accionIds.length) {
    const { rows: sub } = await pool.query('SELECT id FROM acciones WHERE id_accion_padre = ANY($1)', [accionIds]);
    subIds = sub.map(r => r.id);
  }
  const todasAcciones = [...accionIds, ...subIds];
  let tareaIds = [];
  if (todasAcciones.length) {
    const { rows: tareas } = await pool.query('SELECT id FROM tareas WHERE id_accion = ANY($1)', [todasAcciones]);
    tareaIds = tareas.map(r => r.id);
  }
  return { etapaIds: [idNodo], accionIds: todasAcciones, tareaIds };
}

// Mismo resultado pero recortado al nodo propio (sin hijos) — usado cuando
// el llamador pide "Solo este elemento" en vez de "Incluir elementos hijos".
function idsSoloPropio(tipoNodo, idNodo) {
  return {
    etapaIds: tipoNodo === 'etapa' ? [idNodo] : [],
    accionIds: tipoNodo === 'accion' ? [idNodo] : [],
    tareaIds: tipoNodo === 'tarea' ? [idNodo] : [],
  };
}

async function idsNodoYDescendientes(tipoNodo, idNodo, incluirHijos = true) {
  return incluirHijos ? idsDescendientes(tipoNodo, idNodo) : idsSoloPropio(tipoNodo, idNodo);
}

module.exports = { idsDescendientes, idsSoloPropio, idsNodoYDescendientes };
