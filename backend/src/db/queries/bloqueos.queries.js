/**
 * ARCHIVO: bloqueos.queries.js
 * PROPÓSITO: Queries para la tabla polimórfica de bloqueos.
 *
 * MINI-CLASE: Bloqueos como historial auditable
 * ─────────────────────────────────────────────────────────────────
 * Cada bloqueo tiene fecha_bloqueo y fecha_desbloqueo. Mientras
 * fecha_desbloqueo sea NULL, el bloqueo está activo. El unique
 * index parcial en la tabla garantiza máximo un activo por entidad.
 * Al desbloquear, se registra nota_resolucion y quién desbloqueó.
 * El historial completo se conserva para auditoría.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

/**
 * Obtiene el bloqueo activo de una entidad (si existe).
 * Retorna la fila con datos del creador, o null.
 */
async function obtenerBloqueoActivo(entidadTipo, entidadId, client) {
  const db = client || pool;
  const res = await db.query(`
    SELECT b.*,
           uc.nombre AS creador_nombre,
           uc.correo AS creador_correo
    FROM bloqueos b
    LEFT JOIN usuarios uc ON uc.id = b.id_creador
    WHERE b.entidad_tipo = $1
      AND b.entidad_id = $2
      AND b.fecha_desbloqueo IS NULL
    LIMIT 1
  `, [entidadTipo, entidadId]);
  return res.rows[0] || null;
}

/**
 * Lista el historial completo de bloqueos de una entidad,
 * ordenado del más reciente al más antiguo.
 */
async function listarHistorial(entidadTipo, entidadId, client) {
  const db = client || pool;
  const res = await db.query(`
    SELECT b.*,
           uc.nombre AS creador_nombre,
           ud.nombre AS desbloqueo_nombre
    FROM bloqueos b
    LEFT JOIN usuarios uc ON uc.id = b.id_creador
    LEFT JOIN usuarios ud ON ud.id = b.id_responsable_desbloqueo
    WHERE b.entidad_tipo = $1
      AND b.entidad_id = $2
    ORDER BY b.fecha_bloqueo DESC
  `, [entidadTipo, entidadId]);
  return res.rows;
}

/**
 * Crea un bloqueo activo. Falla con unique_violation (23505)
 * si ya existe uno activo para la misma entidad.
 */
async function crear(entidadTipo, entidadId, motivo, idCreador, client) {
  const db = client || pool;
  const res = await db.query(`
    INSERT INTO bloqueos (entidad_tipo, entidad_id, motivo, id_creador)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [entidadTipo, entidadId, motivo, idCreador]);
  return res.rows[0];
}

/**
 * Cierra el bloqueo activo de una entidad.
 * Retorna la fila actualizada o null si no había bloqueo activo.
 */
async function resolver(entidadTipo, entidadId, notaResolucion, idResponsable, client) {
  const db = client || pool;
  const res = await db.query(`
    UPDATE bloqueos
    SET fecha_desbloqueo = NOW(),
        nota_resolucion = $1,
        id_responsable_desbloqueo = $2
    WHERE entidad_tipo = $3
      AND entidad_id = $4
      AND fecha_desbloqueo IS NULL
    RETURNING *
  `, [notaResolucion, idResponsable, entidadTipo, entidadId]);
  return res.rows[0] || null;
}

/**
 * Resuelve un bloqueo específico por su ID.
 */
async function resolverPorId(bloqueoId, notaResolucion, idResponsable, client) {
  const db = client || pool;
  const res = await db.query(`
    UPDATE bloqueos
    SET fecha_desbloqueo = NOW(),
        nota_resolucion = $1,
        id_responsable_desbloqueo = $2
    WHERE id = $3
      AND fecha_desbloqueo IS NULL
    RETURNING *
  `, [notaResolucion, idResponsable, bloqueoId]);
  return res.rows[0] || null;
}

module.exports = {
  obtenerBloqueoActivo,
  listarHistorial,
  crear,
  resolver,
  resolverPorId
};
