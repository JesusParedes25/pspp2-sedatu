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
async function notificarNuevoMiembro(proyectoId, idUsuarioNuevo, rol, quienInvita) {
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [proyectoId]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    await crearNotificacion({
      tipo: 'Invitacion',
      mensaje: `${quienInvita || 'Alguien'} te invitó a participar en el proyecto "${nombreProyecto}" como ${rol}. Puedes aceptar o rechazar la invitación.`,
      entidadTipo: 'Proyecto',
      entidadId: proyectoId,
      idUsuario: idUsuarioNuevo,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar nuevo miembro:', err.message);
  }
}

// GET /mis-invitaciones — las que este usuario tiene sin responder
async function misInvitaciones(req, res, next) {
  try {
    const pendientes = await miembrosQueries.invitacionesPendientes(req.usuario.id);
    res.json({ datos: pendientes, mensaje: 'Invitaciones pendientes' });
  } catch (err) { next(err); }
}

// POST /proyectos/:id/miembros/responder — { respuesta: 'aceptar'|'rechazar', motivo }
//
// Solo el propio invitado responde: no se acepta un id_usuario en el body.
// Rechazar exige motivo — quien invitó necesita saber por qué para poder
// reasignar el trabajo, y un rechazo mudo obliga a ir a preguntar.
async function responderInvitacion(req, res, next) {
  try {
    const { respuesta, motivo } = req.body || {};
    if (!['aceptar', 'rechazar'].includes(respuesta)) {
      return res.status(400).json({ error: true, mensaje: "respuesta debe ser 'aceptar' o 'rechazar'" });
    }
    const acepta = respuesta === 'aceptar';
    if (!acepta && !(motivo || '').trim()) {
      return res.status(400).json({ error: true, mensaje: 'Para rechazar la invitación explica brevemente el motivo.' });
    }

    const fila = await miembrosQueries.responderInvitacion(
      req.params.id, req.usuario.id, acepta, (motivo || '').trim()
    );
    if (!fila) {
      return res.status(404).json({ error: true, mensaje: 'No tienes una invitación pendiente en este proyecto.' });
    }

    await notificarRespuesta({
      idQuienInvito: fila.invitado_por,
      nombreQuienResponde: req.usuario.nombre_completo,
      acepta,
      funcion: fila.rol,
      idProyecto: req.params.id,
      motivo,
    });

    res.json({ datos: fila, mensaje: acepta ? 'Invitación aceptada' : 'Invitación rechazada' });
  } catch (err) { next(err); }
}

// Avisa a quien invitó cómo le fue. Vale para proyecto y para nodo.
async function notificarRespuesta({ idQuienInvito, nombreQuienResponde, acepta, funcion, idProyecto, motivo }) {
  if (!idQuienInvito) return;
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [idProyecto]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    const verbo = acepta ? 'aceptó' : 'rechazó';
    const base = `${nombreQuienResponde} ${verbo} tu invitación para ser ${funcion} en el proyecto "${nombreProyecto}".`;
    await crearNotificacion({
      tipo: 'RespuestaInvitacion',
      mensaje: acepta ? base : `${base} Motivo: ${motivo}`,
      entidadTipo: 'Proyecto',
      entidadId: idProyecto,
      idUsuario: idQuienInvito,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar respuesta de invitación:', err.message);
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

    // Cambiar la función del único responsable a 'colaborador' deja el
    // proyecto sin dueño igual que quitarlo. Mismo freno.
    if (rol !== 'responsable' && await miembrosQueries.esUnicoResponsable(req.params.id, id_usuario)) {
      return res.status(409).json({
        error: true,
        codigo: 'ULTIMO_RESPONSABLE',
        mensaje: 'Este proyecto se quedaría sin responsable. Designa antes a otra persona como responsable y vuelve a intentarlo.',
      });
    }

    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rol, req.usuario.id);
    await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Nuevo miembro agregado al proyecto', entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol } });
    await notificarNuevoMiembro(req.params.id, id_usuario, rol, req.usuario.nombre_completo);
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
    // Ningún proyecto debe quedarse sin responsable: sin él no hay a quién
    // avisarle las solicitudes ni quién designe participantes. Aplica
    // también cuando alguien se quita a sí mismo.
    if (await miembrosQueries.esUnicoResponsable(id, userId)) {
      return res.status(409).json({
        error: true,
        codigo: 'ULTIMO_RESPONSABLE',
        mensaje: 'Este proyecto se quedaría sin responsable. Designa antes a otra persona como responsable y vuelve a intentarlo.',
      });
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
    await notificarNuevoMiembro(req.params.id, id_usuario, rol || 'colaborador', req.usuario.nombre_completo);
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
  misInvitaciones,
  responderInvitacion,
  agregarMiembro,
  eliminarMiembro,
  crearInvitacion,
  listarInvitaciones,
  aceptarInvitacion,
  cancelarInvitacion
};
