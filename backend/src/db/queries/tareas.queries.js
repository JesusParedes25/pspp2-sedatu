/**
 * ARCHIVO: tareas.queries.js
 * PROPÓSITO: Queries SQL para la tabla tareas (hijas de acciones).
 */
const pool = require('../pool');

async function obtenerTareasPorAccion(accionId) {
  const resultado = await pool.query(`
    SELECT t.*, u.nombre_completo AS responsable_nombre
    FROM tareas t
    LEFT JOIN usuarios u ON u.id = t.id_responsable
    WHERE t.id_accion = $1
    ORDER BY t.orden, t.created_at
  `, [accionId]);
  return resultado.rows;
}

async function obtenerTareaPorId(id) {
  const resultado = await pool.query('SELECT * FROM tareas WHERE id = $1', [id]);
  return resultado.rows[0] || null;
}

async function crearTarea(datos) {
  const resultado = await pool.query(`
    INSERT INTO tareas (nombre, id_accion, estado, prioridad, fecha_inicio, fecha_limite, id_responsable, observaciones, orden)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, (SELECT COALESCE(MAX(orden),0)+1 FROM tareas WHERE id_accion=$2)))
    RETURNING *
  `, [
    datos.nombre,
    datos.id_accion,
    datos.estado || 'Pendiente',
    datos.prioridad || 'Media',
    datos.fecha_inicio || null,
    datos.fecha_limite || null,
    datos.id_responsable || null,
    datos.observaciones || null,
    datos.orden || null
  ]);
  return resultado.rows[0];
}

async function actualizarTarea(id, datos) {
  const resultado = await pool.query(`
    UPDATE tareas SET
      nombre = COALESCE($2, nombre),
      estado = COALESCE($3, estado),
      prioridad = COALESCE($4, prioridad),
      fecha_inicio = $5,
      fecha_limite = $6,
      id_responsable = $7,
      observaciones = $8,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    datos.nombre,
    datos.estado,
    datos.prioridad,
    datos.fecha_inicio !== undefined ? datos.fecha_inicio : null,
    datos.fecha_limite !== undefined ? datos.fecha_limite : null,
    datos.id_responsable !== undefined ? datos.id_responsable : null,
    datos.observaciones !== undefined ? datos.observaciones : null
  ]);
  return resultado.rows[0] || null;
}

async function eliminarTarea(id) {
  const resultado = await pool.query('DELETE FROM tareas WHERE id = $1 RETURNING *', [id]);
  return resultado.rows[0] || null;
}

module.exports = {
  obtenerTareasPorAccion,
  obtenerTareaPorId,
  crearTarea,
  actualizarTarea,
  eliminarTarea
};
