/**
 * ARCHIVO: comentarios.queries.js
 * PROPÓSITO: Queries SQL para la tabla comentarios (inmutables).
 *
 * MINI-CLASE: Comentarios inmutables y hilos
 * ─────────────────────────────────────────────────────────────────
 * Los comentarios en PSPP son INMUTABLES: una vez creados, no se
 * pueden editar ni eliminar. Esto garantiza la integridad del
 * historial de comunicación. Los hilos se modelan con
 * id_comentario_padre: un comentario raíz tiene padre NULL, y las
 * respuestas apuntan al comentario al que responden. El campo
 * entidad_tipo + entidad_id permite vincular comentarios a cualquier
 * entidad del sistema (Proyecto, Etapa, Acción, etc.).
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Obtiene comentarios de una entidad con datos del autor, ordenados cronológicamente
async function obtenerComentarios(entidadTipo, entidadId) {
  const resultado = await pool.query(`
    SELECT
      c.*,
      u.nombre_completo AS autor_nombre,
      u.cargo AS autor_cargo,
      dg.siglas AS autor_dg_siglas
    FROM comentarios c
    LEFT JOIN usuarios u ON u.id = c.id_autor
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE c.entidad_tipo = $1 AND c.entidad_id = $2
    ORDER BY c.created_at ASC
  `, [entidadTipo, entidadId]);

  // Organizar en hilos: comentarios raíz con sus respuestas anidadas
  const raices = resultado.rows.filter(c => !c.id_comentario_padre);
  const respuestas = resultado.rows.filter(c => c.id_comentario_padre);

  return raices.map(raiz => ({
    ...raiz,
    respuestas: respuestas.filter(r => r.id_comentario_padre === raiz.id)
  }));
}

// Crea un nuevo comentario
async function crearComentario(datos) {
  const resultado = await pool.query(`
    INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [datos.entidad_tipo, datos.entidad_id, datos.contenido, datos.id_autor]);

  return resultado.rows[0];
}

// Crea una respuesta a un comentario existente
async function responderComentario(comentarioPadreId, datos) {
  // Obtener la entidad del comentario padre para vincular la respuesta
  const padre = await pool.query(
    'SELECT entidad_tipo, entidad_id FROM comentarios WHERE id = $1',
    [comentarioPadreId]
  );

  if (!padre.rows[0]) {
    throw new Error('Comentario padre no encontrado');
  }

  const resultado = await pool.query(`
    INSERT INTO comentarios (entidad_tipo, entidad_id, contenido, id_autor, id_comentario_padre)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    padre.rows[0].entidad_tipo,
    padre.rows[0].entidad_id,
    datos.contenido,
    datos.id_autor,
    comentarioPadreId
  ]);

  return resultado.rows[0];
}

module.exports = {
  obtenerComentarios,
  crearComentario,
  responderComentario
};
