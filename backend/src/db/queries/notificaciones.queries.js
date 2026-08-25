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

// Tipos que YA tienen su propia tarjeta accionable arriba en la página de
// Notificaciones (InvitacionesPendientes / SolicitudesPorResolver /
// AsignacionesRiesgoPendientes) mientras siguen pendientes. Sin excluirlos
// aquí, el mismo pendiente aparecía dos veces: como tarjeta con Aceptar/
// Declinar y otra vez como fila de solo lectura en "Avisos" — mismo
// criterio que ya usa contarNoLeidasParaCampanita más abajo, aplicado
// también al listado completo y no solo al conteo.
const TIPOS_CON_TARJETA_PROPIA = ['Solicitud', 'Invitacion', 'AsignacionRiesgo'];

// Obtiene notificaciones del usuario, agrupables por período
async function obtenerNotificaciones(usuarioId, soloNoLeidas = false) {
  const condiciones = ['n.id_usuario = $1', `n.tipo NOT IN ('${TIPOS_CON_TARJETA_PROPIA.join("','")}')`];
  const parametros = [usuarioId];

  if (soloNoLeidas) {
    condiciones.push('n.leida = false');
  }

  // Se resuelve el proyecto al que pertenece la entidad para que la
  // interfaz pueda llevar al usuario directo a lo que le están avisando.
  // Sin esto, una notificación sobre una etapa no era clicable: el
  // frontend tiene el id de la etapa pero no sabe en qué proyecto vive.
  const resultado = await pool.query(`
    SELECT n.*,
      CASE n.entidad_tipo
        WHEN 'Proyecto' THEN n.entidad_id
        WHEN 'Etapa'    THEN (SELECT e.id_proyecto FROM etapas e WHERE e.id = n.entidad_id)
        WHEN 'Accion'   THEN (
          SELECT COALESCE(a.id_proyecto, e.id_proyecto)
          FROM acciones a LEFT JOIN etapas e ON e.id = a.id_etapa
          WHERE a.id = n.entidad_id
        )
        WHEN 'Tarea'    THEN (
          SELECT COALESCE(a.id_proyecto, e.id_proyecto)
          FROM tareas t
          JOIN acciones a ON a.id = t.id_accion
          LEFT JOIN etapas e ON e.id = a.id_etapa
          WHERE t.id = n.entidad_id
        )
      END AS id_proyecto
    FROM notificaciones n
    WHERE ${condiciones.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT 50
  `, parametros);

  return resultado.rows;
}

// Cuenta notificaciones no leídas — mismo criterio que obtenerNotificaciones
// (excluye los tipos con tarjeta propia): el "X sin leer" de esta página
// tiene que contar lo mismo que efectivamente se ve en Avisos. Antes del
// filtro de obtenerNotificaciones esto ya coincidía por accidente; sin
// este mismo filtro aquí, una Solicitud/Invitación/AsignacionRiesgo
// resuelta desde su tarjeta se quedaba contando como "sin leer" para
// siempre, porque su fila en Avisos —la única forma de marcarla leída—
// ya no se mostraba.
async function contarNoLeidas(usuarioId) {
  const resultado = await pool.query(
    `SELECT COUNT(*) AS total FROM notificaciones
     WHERE id_usuario = $1 AND leida = false
       AND tipo NOT IN ('${TIPOS_CON_TARJETA_PROPIA.join("','")}')`,
    [usuarioId]
  );
  return parseInt(resultado.rows[0].total);
}

// Igual que contarNoLeidas, pero sin los tipos con tarjeta propia (ver
// TIPOS_CON_TARJETA_PROPIA). Los usa el resumen de la campanita (ver
// notificaciones.controller.js → resumen), que ya suma por separado
// cuántas invitaciones, solicitudes y asignaciones de riesgo siguen
// pendientes de resolver — esos SÍ tienen su propia fila en
// `notificaciones` cuando llegan (para que aparezcan en el historial de
// avisos), así que sin este filtro el mismo evento se contaría dos
// veces: una como "aviso sin leer" y otra como "pendiente por resolver".
// El resultado sería un número inflado que no coincide con cuántas
// cosas hay realmente por atender.
async function contarNoLeidasParaCampanita(usuarioId) {
  const resultado = await pool.query(
    `SELECT COUNT(*) AS total FROM notificaciones
     WHERE id_usuario = $1 AND leida = false
       AND tipo NOT IN ('${TIPOS_CON_TARJETA_PROPIA.join("','")}')`,
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
  contarNoLeidasParaCampanita,
  marcarLeida,
  marcarTodasLeidas
};
