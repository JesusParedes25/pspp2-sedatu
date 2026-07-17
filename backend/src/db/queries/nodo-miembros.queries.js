/**
 * ARCHIVO: nodo-miembros.queries.js
 * PROPÓSITO: Queries SQL para miembros asignados a etapas y acciones específicas.
 */
const pool = require('../pool');

async function listarMiembros(tipo, idNodo, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    SELECT nm.id, nm.tipo_nodo, nm.id_nodo, nm.rol, nm.created_at,
           u.id AS id_usuario, u.nombre_completo, u.correo,
           dg.siglas AS dg_siglas,
           inv.nombre_completo AS invitado_por_nombre
    FROM nodo_miembros nm
    JOIN usuarios u ON u.id = nm.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    LEFT JOIN usuarios inv ON inv.id = nm.id_invitado_por
    WHERE nm.tipo_nodo = $1 AND nm.id_nodo = $2
    ORDER BY
      CASE nm.rol WHEN 'responsable' THEN 1 WHEN 'colaborador' THEN 2 ELSE 3 END,
      u.nombre_completo
  `, [tipo, idNodo]);
  return rows;
}

async function agregarMiembro(tipo, idNodo, idUsuario, rol, idInvitadoPor, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    INSERT INTO nodo_miembros (tipo_nodo, id_nodo, id_usuario, rol, id_invitado_por)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tipo_nodo, id_nodo, id_usuario) DO UPDATE SET rol = EXCLUDED.rol
    RETURNING *
  `, [tipo, idNodo, idUsuario, rol || 'colaborador', idInvitadoPor || null]);
  return rows[0];
}

async function actualizarRol(tipo, idNodo, idUsuario, rol, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    UPDATE nodo_miembros SET rol = $4
    WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3
    RETURNING *
  `, [tipo, idNodo, idUsuario, rol]);
  return rows[0] || null;
}

async function eliminarMiembro(tipo, idNodo, idUsuario, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    DELETE FROM nodo_miembros
    WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3
    RETURNING id
  `, [tipo, idNodo, idUsuario]);
  return rows[0] || null;
}

module.exports = { listarMiembros, agregarMiembro, actualizarRol, eliminarMiembro };
