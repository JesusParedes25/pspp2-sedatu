/**
 * ARCHIVO: actividad-log.js
 * PROPÓSITO: Registrar eventos de actividad en proyectos para la sección
 *            "Actividad Reciente" del dashboard.
 *
 * Tipos de evento: estado, avance, evidencia, comentario, miembro,
 *                  creacion, indicador, tarea
 */
const pool = require('../db/pool');

/**
 * Registra un evento de actividad en un proyecto.
 *
 * @param {object} opts
 * @param {string} opts.id_proyecto  - UUID del proyecto
 * @param {string} opts.id_usuario   - UUID del usuario que realizó la acción
 * @param {string} opts.tipo         - Tipo de evento (estado, avance, evidencia, etc.)
 * @param {string} opts.titulo       - Descripción corta del evento
 * @param {string} [opts.descripcion] - Detalle adicional
 * @param {string} [opts.entidad_tipo] - Tipo de entidad afectada (etapa, accion, tarea, etc.)
 * @param {string} [opts.entidad_id]   - UUID de la entidad afectada
 * @param {object} [opts.metadata]     - Datos extra en JSON
 * @param {object} [opts.client]       - pg client de transacción (opcional)
 */
async function registrarActividad(opts) {
  const {
    id_proyecto, id_usuario, tipo, titulo,
    descripcion, entidad_tipo, entidad_id, metadata, client
  } = opts;

  if (!id_proyecto || !tipo || !titulo) return;

  const db = client || pool;
  try {
    await db.query(
      `INSERT INTO actividad_log
         (id_proyecto, id_usuario, tipo, titulo, descripcion, entidad_tipo, entidad_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id_proyecto,
        id_usuario || null,
        tipo,
        titulo,
        descripcion || null,
        entidad_tipo || null,
        entidad_id || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (err) {
    // No lanzar error para no interrumpir la operación principal
    console.error('[actividad-log] Error al registrar actividad:', err.message);
  }
}

module.exports = { registrarActividad };
