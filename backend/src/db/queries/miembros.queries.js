/**
 * ARCHIVO: miembros.queries.js
 * PROPÓSITO: Queries para proyecto_usuarios y proyecto_invitaciones.
 */
const pool = require('../pool');
const crypto = require('crypto');

// ─── Miembros ─────────────────────────────────────────────────

async function listarMiembros(proyectoId) {
  const { rows } = await pool.query(`
    SELECT pu.id_proyecto, pu.id_usuario, pu.rol, pu.invitado_en, pu.aceptado_en,
      u.nombre_completo, u.correo, u.cargo, u.rol AS rol_sistema,
      dg.siglas AS dg_siglas, dg.nombre AS dg_nombre
    FROM proyecto_usuarios pu
    JOIN usuarios u ON u.id = pu.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE pu.id_proyecto = $1
    ORDER BY pu.rol DESC, u.nombre_completo
  `, [proyectoId]);
  return rows;
}

async function agregarMiembro(proyectoId, usuarioId, rol, invitadoPor) {
  const { rows } = await pool.query(`
    INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, aceptado_en)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (id_proyecto, id_usuario) DO UPDATE SET rol = $3
    RETURNING *
  `, [proyectoId, usuarioId, rol, invitadoPor]);
  return rows[0];
}

async function eliminarMiembro(proyectoId, usuarioId) {
  const { rowCount } = await pool.query(
    'DELETE FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
    [proyectoId, usuarioId]
  );
  return rowCount > 0;
}

async function obtenerRolUsuario(proyectoId, usuarioId) {
  const { rows } = await pool.query(
    'SELECT rol FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
    [proyectoId, usuarioId]
  );
  return rows[0]?.rol || null;
}

/**
 * Verifica si un usuario tiene acceso a un proyecto.
 * Acceso: es miembro del proyecto, es creador, o es superadmin/Ejecutivo.
 */
async function tieneAcceso(proyectoId, usuario) {
  if (!usuario) return false;
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return true;

  const { rows } = await pool.query(`
    SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2
    UNION
    SELECT 1 FROM proyectos WHERE id = $1 AND id_creador = $2
  `, [proyectoId, usuario.id]);
  return rows.length > 0;
}

// ─── Invitaciones ─────────────────────────────────────────────

async function crearInvitacion(proyectoId, correo, rol, invitadoPor) {
  const token = crypto.randomBytes(32).toString('hex');

  // Check if user with this email exists
  const { rows: usuarios } = await pool.query(
    'SELECT id FROM usuarios WHERE correo = $1 AND activo = true', [correo]
  );
  const idUsuario = usuarios[0]?.id || null;

  // Check if already invited (pending)
  const { rows: existentes } = await pool.query(
    `SELECT id FROM proyecto_invitaciones 
     WHERE id_proyecto = $1 AND correo = $2 AND estado = 'pendiente'`,
    [proyectoId, correo]
  );
  if (existentes.length > 0) {
    return { duplicada: true };
  }

  // Check if already a member
  if (idUsuario) {
    const { rows: miembro } = await pool.query(
      'SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
      [proyectoId, idUsuario]
    );
    if (miembro.length > 0) {
      return { yaMiembro: true };
    }
  }

  const { rows } = await pool.query(`
    INSERT INTO proyecto_invitaciones (id_proyecto, correo, rol, id_usuario, invitado_por, token)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [proyectoId, correo, rol, idUsuario, invitadoPor, token]);
  return rows[0];
}

async function listarInvitaciones(proyectoId) {
  const { rows } = await pool.query(`
    SELECT pi.*, u.nombre_completo AS invitador_nombre
    FROM proyecto_invitaciones pi
    LEFT JOIN usuarios u ON u.id = pi.invitado_por
    WHERE pi.id_proyecto = $1
    ORDER BY pi.created_at DESC
  `, [proyectoId]);
  return rows;
}

async function aceptarInvitacion(token, usuarioId) {
  const { rows } = await pool.query(`
    UPDATE proyecto_invitaciones
    SET estado = 'aceptada', id_usuario = $2, accepted_at = NOW()
    WHERE token = $1 AND estado = 'pendiente'
    RETURNING *
  `, [token, usuarioId]);

  if (!rows[0]) return null;

  const inv = rows[0];
  // Add user to project
  await pool.query(`
    INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, aceptado_en)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (id_proyecto, id_usuario) DO NOTHING
  `, [inv.id_proyecto, usuarioId, inv.rol, inv.invitado_por]);

  return inv;
}

async function cancelarInvitacion(invitacionId) {
  const { rows } = await pool.query(`
    UPDATE proyecto_invitaciones SET estado = 'cancelada'
    WHERE id = $1 AND estado = 'pendiente'
    RETURNING *
  `, [invitacionId]);
  return rows[0];
}

/**
 * Returns projects where the user is a member (for personalized queries).
 */
async function obtenerProyectosUsuario(usuarioId) {
  const { rows } = await pool.query(`
    SELECT id_proyecto FROM proyecto_usuarios WHERE id_usuario = $1
  `, [usuarioId]);
  return rows.map(r => r.id_proyecto);
}

module.exports = {
  listarMiembros,
  agregarMiembro,
  eliminarMiembro,
  obtenerRolUsuario,
  tieneAcceso,
  crearInvitacion,
  listarInvitaciones,
  aceptarInvitacion,
  cancelarInvitacion,
  obtenerProyectosUsuario
};
