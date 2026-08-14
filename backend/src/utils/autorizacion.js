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
 * fuente de verdad en el backend, y distingue tres facultades que antes
 * se confundían en una sola:
 *   • gestionar   — eliminar el proyecto o sus nodos (lo irreversible)
 *   • editar      — modificar la información del proyecto
 *   • participantes — invitar, cambiar de papel o retirar a alguien
 * Cada una tiene su propio alcance por rol; la interfaz replica estas
 * mismas reglas en frontend/src/hooks/usePermisos.js.
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

// ¿Puede este usuario gestionar (eliminar, invitar) el proyecto dado?
//
// Gestionar es lo destructivo y lo de control. Aquí el 'ejecutivo' NO
// tiene barra libre: manda en los proyectos de SU Dirección General, no
// en los de otras áreas. Un subsecretario necesita ver toda la Secretaría
// y dar seguimiento, no borrar el trabajo de una DG ajena.
//
// Ojo con el caso real: hay usuarios 'ejecutivo' SIN DG asignada. Por eso
// la regla no es solo "misma DG" — se conservan siempre las vías de
// creador y responsable, para que nadie pierda el control de lo suyo por
// no tener una DG capturada.
//
// superadmin sigue sin límites: es quien administra la plataforma y tiene
// la papelera de 30 días para revertir.
async function puedeGestionarProyecto({ usuario, idProyecto }, db) {
  if (!usuario || !idProyecto) return false;
  if (usuario.rol === 'superadmin') return true;

  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT id_creador, id_dg_lider FROM proyectos WHERE id = $1', [idProyecto]
  );
  if (!rows[0]) return false;

  if (rows[0].id_creador === usuario.id) return true;
  if (usuario.rol === 'ejecutivo' && usuario.id_dg && rows[0].id_dg_lider === usuario.id_dg) return true;

  const rolProyecto = await miembrosQueries.obtenerRolUsuario(idProyecto, usuario.id);
  return rolProyecto === 'responsable';
}

// ¿Puede este usuario EDITAR los datos del proyecto (nombre, fechas,
// clasificación, indicadores)?
//
// La edición está acotada al ámbito de responsabilidad de cada quien:
// quien puede gestionar el proyecto, y además un 'direccion' sobre los
// proyectos liderados por SU Dirección General aunque no sea su creador
// ni responsable — mandar sobre lo de su área es justamente su función.
//
// El 'ejecutivo' NO edita fuera de su Dirección General. Su función es de
// seguimiento institucional: consulta toda la Secretaría y coordina a los
// participantes de cualquier proyecto, pero la información sustantiva la
// captura y corrige el área responsable. Su vía de edición es la misma
// que la de un director: la de su propia DG, resuelta en
// puedeGestionarProyecto.
async function puedeEditarProyecto({ usuario, idProyecto }, db) {
  if (!usuario || !idProyecto) return false;

  if (await puedeGestionarProyecto({ usuario, idProyecto }, db)) return true;

  if (usuario.rol === 'direccion' && usuario.id_dg) {
    const conn = db || pool;
    const { rows } = await conn.query(
      'SELECT id_dg_lider FROM proyectos WHERE id = $1', [idProyecto]
    );
    return rows[0]?.id_dg_lider === usuario.id_dg;
  }

  return false;
}

// ¿Puede este usuario gestionar los PARTICIPANTES del proyecto (invitar,
// cambiar el papel de alguien, retirarlo)?
//
// Es la única facultad que el 'ejecutivo' conserva sobre toda la
// Secretaría. Coordinar quién atiende cada proyecto es propio del cargo y
// no altera la información sustantiva: no borra trabajo ni reescribe
// avances, solo determina a quién se le asigna. Por eso se separa tanto
// de editar como de eliminar.
//
// Un 'direccion' gestiona participantes en los proyectos liderados por su
// Dirección General, en congruencia con su facultad de edición.
async function puedeGestionarParticipantes({ usuario, idProyecto }, db) {
  if (!usuario || !idProyecto) return false;
  if (usuario.rol === 'ejecutivo') return true;
  return puedeEditarProyecto({ usuario, idProyecto }, db);
}

// ¿Puede este usuario ELIMINAR un nodo específico (etapa, acción, tarea)?
// Resuelve el proyecto dueño del nodo y aplica la regla de gestión.
async function puedeGestionarNodo({ usuario, tipoNodo, idNodo }, db) {
  const idProyecto = await obtenerProyectoIdDeNodo(tipoNodo, idNodo, db);
  if (!idProyecto) return false;
  return puedeGestionarProyecto({ usuario, idProyecto }, db);
}

// ¿Puede gestionar los participantes asignados a un nodo específico?
// Misma facultad que a nivel proyecto, resuelta desde el nodo.
async function puedeGestionarParticipantesNodo({ usuario, tipoNodo, idNodo }, db) {
  const idProyecto = await obtenerProyectoIdDeNodo(tipoNodo, idNodo, db);
  if (!idProyecto) return false;
  return puedeGestionarParticipantes({ usuario, idProyecto }, db);
}

module.exports = {
  obtenerProyectoIdDeNodo,
  puedeGestionarProyecto,
  puedeEditarProyecto,
  puedeGestionarParticipantes,
  puedeGestionarNodo,
  puedeGestionarParticipantesNodo,
};
