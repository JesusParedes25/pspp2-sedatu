/**
 * ARCHIVO: autorizacion.js
 * PROPÓSITO: Verificación centralizada de permisos de gestión (eliminar
 *            etapas/acciones, agregar/quitar miembros) sobre un proyecto
 *            o un nodo (etapa/acción/tarea) dentro de él.
 *
 * MINI-CLASE: Por qué centralizar esto
 * ─────────────────────────────────────────────────────────────────
 * Antes de este archivo, la regla "¿puede este usuario gestionar
 * este proyecto?" estaba duplicada en miembros.controller.js y
 * replicada (con matices) en usePermisos.js del frontend, mientras
 * que DELETE /etapas/:id, DELETE /acciones/:id y los endpoints de
 * miembros-nodo no la aplicaban en absoluto. Este módulo es la única
 * fuente de verdad en el backend; usa exactamente la misma regla que
 * ya está en producción para invitar a nivel proyecto:
 *   superadmin/ejecutivo, o creador del proyecto, o responsable del
 *   proyecto (proyecto_usuarios.rol = 'responsable').
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const miembrosQueries = require('../db/queries/miembros.queries');

// Resuelve el id_proyecto dueño de un nodo (etapa, acción/subacción o tarea)
async function obtenerProyectoIdDeNodo(tipoNodo, idNodo, db) {
  const conn = db || pool;

  if (tipoNodo === 'etapa') {
    const { rows } = await conn.query('SELECT id_proyecto FROM etapas WHERE id = $1', [idNodo]);
    return rows[0]?.id_proyecto || null;
  }

  if (tipoNodo === 'tarea') {
    const { rows } = await conn.query('SELECT id_accion FROM tareas WHERE id = $1', [idNodo]);
    if (!rows[0]?.id_accion) return null;
    return obtenerProyectoIdDeNodo('accion', rows[0].id_accion, conn);
  }

  // accion / subaccion
  const { rows } = await conn.query('SELECT id_proyecto, id_etapa FROM acciones WHERE id = $1', [idNodo]);
  if (!rows[0]) return null;
  if (rows[0].id_proyecto) return rows[0].id_proyecto;
  if (rows[0].id_etapa) return obtenerProyectoIdDeNodo('etapa', rows[0].id_etapa, conn);
  return null;
}

// ¿Puede este usuario gestionar (eliminar / invitar) el proyecto dado?
async function puedeGestionarProyecto({ usuario, idProyecto }, db) {
  if (!usuario || !idProyecto) return false;
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return true;

  const conn = db || pool;
  const { rows } = await conn.query('SELECT id_creador FROM proyectos WHERE id = $1', [idProyecto]);
  if (rows[0]?.id_creador === usuario.id) return true;

  const rolProyecto = await miembrosQueries.obtenerRolUsuario(idProyecto, usuario.id);
  return rolProyecto === 'responsable';
}

// ¿Puede este usuario gestionar (eliminar / invitar) un nodo específico?
// Resuelve el proyecto dueño del nodo y aplica la misma regla.
async function puedeGestionarNodo({ usuario, tipoNodo, idNodo }, db) {
  const idProyecto = await obtenerProyectoIdDeNodo(tipoNodo, idNodo, db);
  if (!idProyecto) return false;
  return puedeGestionarProyecto({ usuario, idProyecto }, db);
}

module.exports = {
  obtenerProyectoIdDeNodo,
  puedeGestionarProyecto,
  puedeGestionarNodo,
};
