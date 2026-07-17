/**
 * ARCHIVO: miembros.controller.js
 * PROPÓSITO: Endpoints para gestión de miembros e invitaciones de proyecto.
 */
const miembrosQueries = require('../db/queries/miembros.queries');
const { registrarActividad } = require('../utils/actividad-log');
const pool = require('../db/pool');

// GET /proyectos/:id/miembros
async function listarMiembros(req, res, next) {
  try {
    const miembros = await miembrosQueries.listarMiembros(req.params.id);
    res.json({ datos: miembros });
  } catch (err) { next(err); }
}

// POST /proyectos/:id/miembros — { id_usuario, rol }
async function agregarMiembro(req, res, next) {
  try {
    const { id_usuario, rol } = req.body;
    if (!id_usuario || !rol) {
      return res.status(400).json({ mensaje: 'id_usuario y rol son requeridos' });
    }
    // Only responsable or superadmin/Ejecutivo can add members
    const rolUsuario = await miembrosQueries.obtenerRolUsuario(req.params.id, req.usuario.id);
    const puedeGestionar = rolUsuario === 'responsable' || req.usuario.rol === 'superadmin' || req.usuario.rol === 'Ejecutivo';
    if (!puedeGestionar) {
      return res.status(403).json({ mensaje: 'No tienes permisos para gestionar miembros' });
    }

    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rol, req.usuario.id);
    await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Nuevo miembro agregado al proyecto', entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol } });
    res.status(201).json({ datos: miembro, mensaje: 'Miembro agregado' });
  } catch (err) { next(err); }
}

// DELETE /proyectos/:id/miembros/:userId
async function eliminarMiembro(req, res, next) {
  try {
    const { id, userId } = req.params;
    // Only responsable or superadmin/Ejecutivo can remove members
    const rolUsuario = await miembrosQueries.obtenerRolUsuario(id, req.usuario.id);
    const puedeGestionar = rolUsuario === 'responsable' || req.usuario.rol === 'superadmin' || req.usuario.rol === 'Ejecutivo';
    if (!puedeGestionar) {
      return res.status(403).json({ mensaje: 'No tienes permisos para eliminar miembros' });
    }
    const eliminado = await miembrosQueries.eliminarMiembro(id, userId);
    if (!eliminado) return res.status(404).json({ mensaje: 'Miembro no encontrado' });
    res.json({ mensaje: 'Miembro eliminado del proyecto' });
  } catch (err) { next(err); }
}

// POST /proyectos/:id/invitaciones — { id_usuario, rol }
// Agrega directamente al usuario como miembro del proyecto
async function crearInvitacion(req, res, next) {
  try {
    const { id_usuario, rol } = req.body;
    if (!id_usuario) {
      return res.status(400).json({ mensaje: 'id_usuario es requerido' });
    }
    const rolUsuario = await miembrosQueries.obtenerRolUsuario(req.params.id, req.usuario.id);
    const puedeInvitar = rolUsuario === 'responsable' || req.usuario.rol === 'superadmin' || req.usuario.rol === 'Ejecutivo';
    if (!puedeInvitar) {
      return res.status(403).json({ mensaje: 'No tienes permisos para invitar usuarios' });
    }

    // Verificar que no sea ya miembro
    const { rows: existente } = await pool.query(
      'SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
      [req.params.id, id_usuario]
    );
    if (existente.length > 0) {
      return res.status(409).json({ mensaje: 'Este usuario ya es miembro del proyecto' });
    }

    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rol || 'colaborador', req.usuario.id);
    await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Usuario agregado al proyecto', entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol } });
    res.status(201).json({ datos: miembro, mensaje: 'Usuario agregado al proyecto' });
  } catch (err) { next(err); }
}

// GET /proyectos/:id/invitaciones
async function listarInvitaciones(req, res, next) {
  try {
    const invitaciones = await miembrosQueries.listarInvitaciones(req.params.id);
    res.json({ datos: invitaciones });
  } catch (err) { next(err); }
}

// POST /invitaciones/:token/aceptar
async function aceptarInvitacion(req, res, next) {
  try {
    const { token } = req.params;
    const resultado = await miembrosQueries.aceptarInvitacion(token, req.usuario.id);
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Invitación no encontrada o ya procesada' });
    }
    res.json({ datos: resultado, mensaje: 'Invitación aceptada, ahora eres miembro del proyecto' });
  } catch (err) { next(err); }
}

// DELETE /invitaciones/:id — cancel a pending invitation
async function cancelarInvitacion(req, res, next) {
  try {
    const resultado = await miembrosQueries.cancelarInvitacion(req.params.id);
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Invitación no encontrada o ya procesada' });
    }
    res.json({ mensaje: 'Invitación cancelada' });
  } catch (err) { next(err); }
}

module.exports = {
  listarMiembros,
  agregarMiembro,
  eliminarMiembro,
  crearInvitacion,
  listarInvitaciones,
  aceptarInvitacion,
  cancelarInvitacion
};
