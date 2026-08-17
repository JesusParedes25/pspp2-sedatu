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

// ¿Puede este usuario CAPTURAR dentro del proyecto (crear etapas y
// acciones, mover avances, editar campos de un nodo)?
//
// Dos vías, y solo dos:
//
//   • quien puede editar el proyecto — creador, responsable, superadmin,
//     y los perfiles con mando de área (direccion / ejecutivo sobre su
//     propia DG), resuelto en puedeEditarProyecto;
//   • quien participa en el proyecto: estar en proyecto_usuarios, sea
//     como responsable o como colaborador.
//
// Pertenecer a la Dirección General que lidera el proyecto NO alcanza por
// sí solo. Antes sí: cualquier enlace o externo del área capturaba en
// todos los proyectos de su DG sin aparecer en ninguno. Eso hacía
// imposible responder "¿quién puede tocar esto?" —la respuesta era "todo
// el área, aunque no se vea"— y dejaba la lista de participantes como
// adorno. Ahora quien captura está escrito en el proyecto, con nombre y
// función. Un director o un ejecutivo sí mandan sobre su DG sin estar
// invitados, porque ese mando viene del cargo, no del área.
async function puedeEditarContenidoProyecto({ usuario, idProyecto }, db) {
  if (!usuario || !idProyecto) return false;
  if (await puedeEditarProyecto({ usuario, idProyecto }, db)) return true;

  const rolProyecto = await miembrosQueries.obtenerRolUsuario(idProyecto, usuario.id);
  return !!rolProyecto;
}

const TABLA_NODO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

// ¿Está esta persona asignada a este nodo en particular? Hay dos formas
// de estarlo y las dos cuentan: ser el responsable principal (columna
// id_responsable de la propia etapa/acción/tarea) o estar en
// nodo_miembros con la invitación ACEPTADA — una pendiente no da acceso.
// Es la vía por la que alguien ajeno al proyecto edita lo que se le
// encargó, por ejemplo desde "Mis actividades".
async function esMiembroDelNodo({ usuario, tipoNodo, idNodo }, conn) {
  const tabla = TABLA_NODO[tipoNodo];
  if (!tabla) return false;
  const { rows } = await conn.query(`
    SELECT 1 FROM ${tabla} WHERE id = $1 AND id_responsable = $2
    UNION ALL
    SELECT 1 FROM nodo_miembros
     WHERE id_nodo = $1 AND id_usuario = $2 AND tipo_nodo = $3 AND estado = 'aceptada'
    LIMIT 1
  `, [idNodo, usuario.id, tipoNodo]);
  return rows.length > 0;
}

// La asignación se hereda hacia abajo: quien es responsable de una etapa
// puede capturar en las acciones y tareas que cuelgan de ella.
async function esMiembroDelNodoOAscendiente({ usuario, tipoNodo, idNodo }, conn) {
  if (await esMiembroDelNodo({ usuario, tipoNodo, idNodo }, conn)) return true;

  if (tipoNodo === 'tarea') {
    const { rows } = await conn.query('SELECT id_accion FROM tareas WHERE id = $1', [idNodo]);
    if (!rows[0]?.id_accion) return false;
    return esMiembroDelNodoOAscendiente({ usuario, tipoNodo: 'accion', idNodo: rows[0].id_accion }, conn);
  }

  if (tipoNodo === 'accion') {
    const { rows } = await conn.query('SELECT id_etapa, id_accion_padre FROM acciones WHERE id = $1', [idNodo]);
    if (rows[0]?.id_accion_padre) {
      return esMiembroDelNodoOAscendiente({ usuario, tipoNodo: 'accion', idNodo: rows[0].id_accion_padre }, conn);
    }
    if (rows[0]?.id_etapa) {
      return esMiembroDelNodo({ usuario, tipoNodo: 'etapa', idNodo: rows[0].id_etapa }, conn);
    }
  }

  return false;
}

// ¿Puede capturar sobre un nodo concreto? Vale con poder capturar en el
// proyecto, o con estar asignado al nodo (o a uno de sus padres).
async function puedeEditarNodo({ usuario, tipoNodo, idNodo }, db) {
  if (!usuario || !idNodo) return false;
  const conn = db || pool;
  const idProyecto = await obtenerProyectoIdDeNodo(tipoNodo, idNodo, conn);
  if (!idProyecto) return false;
  if (await puedeEditarContenidoProyecto({ usuario, idProyecto }, conn)) return true;
  return esMiembroDelNodoOAscendiente({ usuario, tipoNodo, idNodo }, conn);
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
  puedeEditarContenidoProyecto,
  puedeEditarNodo,
  puedeGestionarNodo,
  puedeGestionarParticipantesNodo,
};
