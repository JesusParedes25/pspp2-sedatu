/**
 * ARCHIVO: miembros.controller.js
 * PROPÓSITO: Endpoints para gestión de miembros e invitaciones de proyecto.
 */
const miembrosQueries = require('../db/queries/miembros.queries');
const { puedeGestionarParticipantes } = require('../utils/autorizacion');
const { registrarActividad } = require('../utils/actividad-log');
const { crearNotificacion } = require('../utils/notificaciones');
const pool = require('../db/pool');

// Notifica al usuario que fue agregado a un proyecto. No lanza error: si
// falla, la membresía ya quedó creada (lo importante) y no queremos que
// la petición completa se caiga por una notificación.
async function notificarNuevoMiembro(proyectoId, idUsuarioNuevo, rol) {
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [proyectoId]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    await crearNotificacion({
      tipo: 'PermisoNuevo',
      mensaje: `Fuiste agregado al proyecto "${nombreProyecto}" como ${rol}.`,
      entidadTipo: 'Proyecto',
      entidadId: proyectoId,
      idUsuario: idUsuarioNuevo,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar nuevo miembro:', err.message);
  }
}

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
    // Regla única en utils/autorizacion.js: responsable o creador del
    // proyecto, la Dirección General que lo lidera, o los cargos con
    // alcance institucional (superadmin, ejecutivo).
    const puedeGestionar = await puedeGestionarParticipantes({ usuario: req.usuario, idProyecto: req.params.id });
    if (!puedeGestionar) {
      return res.status(403).json({ mensaje: 'No tienes permisos para gestionar miembros' });
    }

    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rol, req.usuario.id);
    await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Nuevo miembro agregado al proyecto', entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol } });
    await notificarNuevoMiembro(req.params.id, id_usuario, rol);
    res.status(201).json({ datos: miembro, mensaje: 'Miembro agregado' });
  } catch (err) { next(err); }
}

// DELETE /proyectos/:id/miembros/:userId
async function eliminarMiembro(req, res, next) {
  try {
    const { id, userId } = req.params;
    const puedeGestionar = await puedeGestionarParticipantes({ usuario: req.usuario, idProyecto: id });
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
    const puedeInvitar = await puedeGestionarParticipantes({ usuario: req.usuario, idProyecto: req.params.id });
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
    await notificarNuevoMiembro(req.params.id, id_usuario, rol || 'colaborador');
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
