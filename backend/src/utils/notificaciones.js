/**
 * ARCHIVO: notificaciones.js
 * PROPÓSITO: Crear notificaciones en la BD cuando ocurren eventos relevantes.
 *
 * MINI-CLASE: Notificaciones internas
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son registros en la tabla `notificaciones`. Son
 * un sistema de "buzón": cuando algo relevante ocurre (vencimiento,
 * mención, nuevo riesgo, invitación, solicitud), se inserta una fila
 * — y esa inserción también avisa por SSE (ver utils/sse.js) a quien
 * la recibió, así que el frontend se entera al instante en vez de
 * esperar al siguiente polling. El usuario las ve al entrar a la
 * página de Notificaciones o en el badge del header y de la barra
 * lateral.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const sse = require('./sse');

// Crea una notificación para un usuario específico. No lanza error para no
// interrumpir la operación principal que la disparó (mismo criterio que
// registrarActividad en actividad-log.js) — a lo sumo, un usuario se queda
// sin ver una notificación puntual, pero su acción original (invitar,
// comentar, reportar un riesgo) no debe fallar por esto.
//
// Al terminar, avisa por SSE (ver utils/sse.js) a quien la recibió: es el
// único punto de entrada de toda notificación del sistema (incluidas
// invitaciones y solicitudes, que también pasan por aquí con su propio
// `tipo`), así que engancharlo aquí una vez cubre todos los casos sin
// tener que acordarse de avisar en cada controlador que crea una.
async function crearNotificacion({ tipo, mensaje, entidadTipo, entidadId, idUsuario }, client) {
  if (!idUsuario) return;
  const db = client || pool;
  try {
    await db.query(`
      INSERT INTO notificaciones (tipo, mensaje, entidad_tipo, entidad_id, id_usuario)
      VALUES ($1, $2, $3, $4, $5)
    `, [tipo, mensaje, entidadTipo, entidadId, idUsuario]);
    sse.avisarUsuario(idUsuario);
  } catch (err) {
    console.error('[notificaciones] Error al crear notificación:', err.message);
  }
}

// Notifica a todos los miembros de un proyecto (excepto a quien disparó el
// evento, si se indica). Fuente de verdad: proyecto_usuarios — según
// CLAUDE.md, proyecto_dgs quedó huérfana (nada la cura desde que no hay UI
// que llame agregarDGProyecto/eliminarDGProyecto) y ya no refleja quién
// participa realmente en el proyecto.
async function notificarEquipoProyecto(proyectoId, tipo, mensaje, entidadTipo, entidadId, excluirUsuarioId, client) {
  const db = client || pool;
  try {
    const resultado = await db.query(`
      SELECT DISTINCT id_usuario
      FROM proyecto_usuarios
      WHERE id_proyecto = $1 AND id_usuario != $2
    `, [proyectoId, excluirUsuarioId || null]);

    for (const fila of resultado.rows) {
      await crearNotificacion({
        tipo,
        mensaje,
        entidadTipo,
        entidadId,
        idUsuario: fila.id_usuario
      }, db);
    }
  } catch (err) {
    console.error('[notificaciones] Error al notificar equipo de proyecto:', err.message);
  }
}

// Notifica cuando una acción está próxima a vencer (llamado desde alertasVencimiento)
async function notificarVencimiento(accion, client) {
  const db = client || pool;

  if (!accion.id_responsable) return;

  const diasRestantes = Math.ceil(
    (new Date(accion.fecha_fin) - new Date()) / (1000 * 60 * 60 * 24)
  );

  await crearNotificacion({
    tipo: 'Vencimiento',
    mensaje: `La acción "${accion.nombre}" vence en ${diasRestantes} día(s)`,
    entidadTipo: 'Accion',
    entidadId: accion.id,
    idUsuario: accion.id_responsable
  }, db);
}

module.exports = {
  crearNotificacion,
  notificarEquipoProyecto,
  notificarVencimiento
};
