/**
 * ARCHIVO: autorizacion.js
 * PROPÓSITO: Verificación centralizada de permisos de gestión (eliminar
 *            etapas/acciones, agregar/quitar miembros) sobre un proyecto
 *            o un nodo (etapa/acción/tarea) dentro de él.
 *
 * MINI-CLASE: Fase 1 del modelo de permisos — una sola función resuelve,
 * el resto solo compara
 * ─────────────────────────────────────────────────────────────────
 * Hasta antes de esta reescritura, cada función de este archivo tenía su
 * propia cadena de OR (superadmin / creador / ejecutivo-de-la-DG /
 * responsable-de-proyecto...), cada una con matices ligeramente distintos
 * — de ahí salían las inconsistencias documentadas en
 * docs/modelo-permisos.md sección 6 (el rol 'invitado' que no restringía
 * nada, el bono de DG que solo tenía un módulo, etc.).
 *
 * Ahora existe una sola fuente de la verdad, utils/funcion-efectiva.js,
 * que resuelve "¿qué peldaño tiene este usuario sobre este elemento, y
 * por qué vía?" (lectura / captura / responsable / administracion_proyecto).
 * Cada función de ESTE archivo es, sin excepción, una comparación contra
 * un peldaño mínimo — no queda ninguna cadena de OR suelta decidiendo
 * permisos fuera de funcionEfectiva.
 *
 * Tabla de peldaños mínimos (aprobada, ver docs/modelo-permisos.md):
 *   puedeEditarContenidoProyecto / puedeEditarNodo   -> captura
 *   puedeGestionarParticipantes(Nodo)                -> responsable
 *   puedeGestionarNodo (eliminar/crear hijo)          -> responsable, EN EL PADRE del nodo, no en el nodo mismo
 *   puedeEditarProyecto / puedeGestionarProyecto      -> administracion_proyecto
 *
 * Cambios de comportamiento visibles respecto de antes (documentados con
 * detalle en docs/modelo-permisos.md, sección "cómo era antes"):
 *   - 'direccion' deja de tener CUALQUIER bono automático por pertenecer
 *     a la DG que lidera un proyecto — solo alcanza según la función que
 *     le dieron, igual que 'enlace'.
 *   - 'ejecutivo' de la misma DG de un proyecto llega a 'responsable' en
 *     todo el proyecto (antes llegaba a gestionarlo/eliminarlo), pero
 *     NUNCA a administracion_proyecto: ya no puede editar la ficha del
 *     proyecto ni eliminarlo por esta vía, y fuera de su propia DG deja
 *     de poder gestionar participantes de cualquier proyecto sin estar
 *     invitado (antes podía, sin condición de DG).
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const {
  funcionEfectivaEnProyecto,
  funcionEfectivaEnNodo,
  resolverElementoPadre,
  alcanza,
} = require('./funcion-efectiva');

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

// ─── Primitivas genéricas sobre la escalera ───────────────────────
// Devuelven {permitido, via} — "via" es lo que necesita la bitácora para
// anotar cuándo una acción se hizo "por su perfil de ejecutivo de DGOTU"
// en vez de por una invitación real (punto 4 de la Fase 1).
async function resolverAccesoProyecto(usuario, idProyecto, minimo, db) {
  const candidato = await funcionEfectivaEnProyecto(usuario, idProyecto, db);
  return { permitido: alcanza(candidato, minimo), via: candidato?.via || null, peldano: candidato?.peldano || null };
}

async function resolverAccesoNodo(usuario, tipoNodo, idNodo, minimo, db) {
  const candidato = await funcionEfectivaEnNodo(usuario, tipoNodo, idNodo, db);
  return { permitido: alcanza(candidato, minimo), via: candidato?.via || null, peldano: candidato?.peldano || null };
}

// Para eliminar un nodo o crear un hijo en él: el peldaño se evalúa en el
// PADRE conceptual (otro nodo, o el proyecto si es de primer nivel), no
// en el nodo mismo.
async function resolverAccesoPadreDeNodo(usuario, tipoNodo, idNodo, minimo, db) {
  const padre = await resolverElementoPadre(tipoNodo, idNodo, db);
  if (!padre) return { permitido: false, via: null, peldano: null };
  if (padre.tipo === 'proyecto') return resolverAccesoProyecto(usuario, padre.id, minimo, db);
  return resolverAccesoNodo(usuario, padre.tipo, padre.id, minimo, db);
}

async function tienePeldanoProyecto(usuario, idProyecto, minimo, db) {
  if (!usuario || !idProyecto) return false;
  return (await resolverAccesoProyecto(usuario, idProyecto, minimo, db)).permitido;
}

async function tienePeldanoNodo(usuario, tipoNodo, idNodo, minimo, db) {
  if (!usuario || !idNodo) return false;
  return (await resolverAccesoNodo(usuario, tipoNodo, idNodo, minimo, db)).permitido;
}

// ─── ¿Puede CAPTURAR (registrar avance, reportar riesgo, adjuntar
// documento, vincular indicador, ligar territorio, comentar)? ──────
async function puedeEditarContenidoProyecto({ usuario, idProyecto }, db) {
  return tienePeldanoProyecto(usuario, idProyecto, 'captura', db);
}

async function puedeEditarNodo({ usuario, tipoNodo, idNodo }, db) {
  return tienePeldanoNodo(usuario, tipoNodo, idNodo, 'captura', db);
}

// ─── ¿Puede GESTIONAR PARTICIPANTES (invitar, cambiar función, retirar)? ──
// Responsable sobre el elemento — a nivel proyecto, incluye a todo el
// proyecto y sus descendientes; a nivel nodo, solo ese nodo y los suyos.
async function puedeGestionarParticipantes({ usuario, idProyecto }, db) {
  return tienePeldanoProyecto(usuario, idProyecto, 'responsable', db);
}

async function puedeGestionarParticipantesNodo({ usuario, tipoNodo, idNodo }, db) {
  return tienePeldanoNodo(usuario, tipoNodo, idNodo, 'responsable', db);
}

// ─── ¿Puede GESTIONAR (eliminar, crear/eliminar hijos) un NODO? ───
// Regla aprobada (docs/modelo-permisos.md 3.3): responsable EN EL PADRE
// del nodo, no en el nodo mismo — así alguien responsable de una etapa
// puede eliminar sus acciones sin necesitar administrar el proyecto
// completo.
async function puedeGestionarNodo({ usuario, tipoNodo, idNodo }, db) {
  if (!usuario || !idNodo) return false;
  return (await resolverAccesoPadreDeNodo(usuario, tipoNodo, idNodo, 'responsable', db)).permitido;
}

// ─── ¿Puede EDITAR LA FICHA DEL PROYECTO o ELIMINARLO? ────────────
// administracion_proyecto — el único peldaño que no existe a nivel nodo
// y que un 'ejecutivo' nunca alcanza por la vía DG (tope explícito en
// funcion-efectiva.js).
async function puedeEditarProyecto({ usuario, idProyecto }, db) {
  return tienePeldanoProyecto(usuario, idProyecto, 'administracion_proyecto', db);
}

async function puedeGestionarProyecto({ usuario, idProyecto }, db) {
  return tienePeldanoProyecto(usuario, idProyecto, 'administracion_proyecto', db);
}

// ─── PATCH /etapas|acciones|tareas/:id — mínimo según los campos del
// payload (punto 5 de la ronda de correcciones) ────────────────────
// Este único endpoint mezcla dos acciones de naturaleza distinta:
// "registrar avance" (avance_actual, estatus_cualitativo, y los cambios
// de estado/territorio que viajan con la misma lógica de seguimiento)
// y "editar la ficha" (nombre, fechas, prioridad, instrumento y demás
// metadatos estructurales). Resuelto por los campos presentes en el
// payload, sin partir el endpoint en dos: si viene AL MENOS un campo de
// ficha, exige 'responsable'; si no viene ninguno, basta 'captura'
// (cubre avance_actual/estatus_cualitativo solos, o junto con estado,
// motivo_bloqueo/nota_resolucion, o los campos de territorio — todos
// comparten el nivel de "dar seguimiento", no de "editar la ficha").
const CAMPOS_FICHA_NODO = [
  'nombre', 'descripcion', 'tipo', 'id_responsable',
  'prioridad', 'fecha_inicio', 'fecha_limite',
  'instrumento', 'escala_territorial',
  'instancia_responsable', 'enlace_responsable',
  'semaforo', 'observaciones',
];

function minimoParaPatchNodo(body) {
  const traeCampoFicha = CAMPOS_FICHA_NODO.some(campo => body[campo] !== undefined);
  return traeCampoFicha ? 'responsable' : 'captura';
}

// ─── ¿Puede VER el proyecto (aunque no lo edite)? ─────────────────
// "Todos ven todos los proyectos, pero solo captura quien está escrito
// en ellos" (ver BotonSolicitarParticipar.jsx): dentro de SEDATU la
// visibilidad ya es total, sin importar el peldaño de la escalera —
// 'lectura' como peldaño solo existe para dar visibilidad puntual a
// alguien de fuera de la Secretaría. Por eso esto NO es un alias de
// tienePeldanoProyecto(..., 'lectura'): un 'enlace' sin ninguna fila en
// proyecto_usuarios/nodo_miembros igual puede VER cualquier proyecto
// (solo no puede editarlo) — lo usa, por ejemplo, agregar un proyecto a
// una cartera, que exige "al menos poder ver" el proyecto, no un
// peldaño formal sobre él.
async function puedeVerProyecto(usuario, idProyecto, db) {
  if (!usuario || !idProyecto) return false;
  if (usuario.rol !== 'externo') return true;
  return tienePeldanoProyecto(usuario, idProyecto, 'lectura', db);
}

module.exports = {
  obtenerProyectoIdDeNodo,
  // Primitivas genéricas (para quien necesite el peldaño/vía exactos,
  // p.ej. para marcar la bitácora "por su perfil de ejecutivo de X").
  resolverAccesoProyecto,
  resolverAccesoNodo,
  resolverAccesoPadreDeNodo,
  tienePeldanoProyecto,
  tienePeldanoNodo,
  // Facultades con nombre, usadas por controllers y middleware.
  puedeGestionarProyecto,
  puedeEditarProyecto,
  puedeVerProyecto,
  minimoParaPatchNodo,
  puedeGestionarParticipantes,
  puedeEditarContenidoProyecto,
  puedeEditarNodo,
  puedeGestionarNodo,
  puedeGestionarParticipantesNodo,
};
