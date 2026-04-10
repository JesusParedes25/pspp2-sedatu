/**
 * ARCHIVO: notificaciones.js
 * PROPÓSITO: Crear notificaciones en la BD cuando ocurren eventos relevantes.
 *
 * MINI-CLASE: Notificaciones internas
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son registros en la tabla `notificaciones` que
 * el frontend consulta periódicamente. NO son push notifications ni
 * WebSockets (eso sería segunda fase). Son un sistema simple de
 * "buzón": cuando algo relevante ocurre (vencimiento, mención,
 * nuevo riesgo), se inserta una fila. El usuario las ve al entrar
 * a la página de Notificaciones o en el badge del header.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

// Crea una notificación para un usuario específico
async function crearNotificacion({ tipo, mensaje, entidadTipo, entidadId, idUsuario }, client) {
  const db = client || pool;

  await db.query(`
    INSERT INTO notificaciones (tipo, mensaje, entidad_tipo, entidad_id, id_usuario)
    VALUES ($1, $2, $3, $4, $5)
  `, [tipo, mensaje, entidadTipo, entidadId, idUsuario]);
}

// Notifica a todos los responsables de un proyecto (excepto al autor de la acción)
async function notificarEquipoProyecto(proyectoId, tipo, mensaje, entidadTipo, entidadId, excluirUsuarioId, client) {
  const db = client || pool;

  // Obtener todos los responsables del proyecto (de proyecto_dgs)
  const resultado = await db.query(`
    SELECT DISTINCT id_responsable
    FROM proyecto_dgs
    WHERE id_proyecto = $1 AND id_responsable IS NOT NULL AND id_responsable != $2
  `, [proyectoId, excluirUsuarioId]);

  // Crear una notificación para cada responsable
  for (const fila of resultado.rows) {
    await crearNotificacion({
      tipo,
      mensaje,
      entidadTipo,
      entidadId,
      idUsuario: fila.id_responsable
    }, db);
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
