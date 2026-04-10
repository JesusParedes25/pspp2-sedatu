/**
 * ARCHIVO: notificaciones.queries.js
 * PROPÓSITO: Queries SQL para la tabla notificaciones.
 *
 * MINI-CLASE: Sistema de notificaciones internas
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son un buzón por usuario. Se crean cuando
 * ocurren eventos relevantes (vencimiento, mención, riesgo nuevo).
 * El frontend las consulta periódicamente con polling (cada 30s).
 * Marcar como leída actualiza `leida = true` y `fecha_lectura`.
 * Las notificaciones nunca se eliminan para mantener el historial.
 * El índice compuesto (id_usuario, leida) optimiza la consulta
 * más frecuente: "mis notificaciones no leídas".
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Obtiene notificaciones del usuario, agrupables por período
async function obtenerNotificaciones(usuarioId, soloNoLeidas = false) {
  const condiciones = ['n.id_usuario = $1'];
  const parametros = [usuarioId];

  if (soloNoLeidas) {
    condiciones.push('n.leida = false');
  }

  const resultado = await pool.query(`
    SELECT n.*
    FROM notificaciones n
    WHERE ${condiciones.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT 50
  `, parametros);

  return resultado.rows;
}

// Cuenta notificaciones no leídas (para el badge del header)
async function contarNoLeidas(usuarioId) {
  const resultado = await pool.query(
    'SELECT COUNT(*) AS total FROM notificaciones WHERE id_usuario = $1 AND leida = false',
    [usuarioId]
  );
  return parseInt(resultado.rows[0].total);
}

// Marca una notificación como leída
async function marcarLeida(notificacionId) {
  const resultado = await pool.query(`
    UPDATE notificaciones
    SET leida = true, fecha_lectura = NOW()
    WHERE id = $1
    RETURNING *
  `, [notificacionId]);

  return resultado.rows[0] || null;
}

// Marca todas las notificaciones del usuario como leídas
async function marcarTodasLeidas(usuarioId) {
  const resultado = await pool.query(`
    UPDATE notificaciones
    SET leida = true, fecha_lectura = NOW()
    WHERE id_usuario = $1 AND leida = false
    RETURNING id
  `, [usuarioId]);

  return resultado.rows.length;
}

module.exports = {
  obtenerNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas
};
