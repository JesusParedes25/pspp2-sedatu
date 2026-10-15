/**
 * ARCHIVO: miembros.controller.js
 * PROPÓSITO: Endpoints para gestión de miembros e invitaciones de proyecto.
 */
const miembrosQueries = require('../db/queries/miembros.queries');
const { resolverAccesoProyecto } = require('../utils/autorizacion');
const { rechazoLecturaParaInterno } = require('../utils/validar-funcion-lectura');
const { registrarActividad } = require('../utils/actividad-log');
const { crearNotificacion } = require('../utils/notificaciones');
const { etiquetaFuncion } = require('../utils/etiquetas-funcion');
const pool = require('../db/pool');

// Contrapeso de un permiso implícito (Fase 1 del modelo de permisos,
// docs/modelo-permisos.md punto 4): cuando un ejecutivo gestiona
// participantes de un proyecto SOLO por pertenecer a la misma DG (no por
// estar invitado ni ser el creador), la bitácora debe decirlo.
async function notaViaDG(acceso, usuario) {
  if (acceso.via !== 'ejecutivo_dg' || !usuario?.id_dg) return '';
  const { rows } = await pool.query('SELECT siglas FROM direcciones_generales WHERE id = $1', [usuario.id_dg]);
  const dg = rows[0]?.siglas || 'su DG';
  return ` (por su perfil de ejecutivo de ${dg})`;
}

// Notifica al usuario que fue agregado a un proyecto. No lanza error: si
// falla, la membresía ya quedó creada (lo importante) y no queremos que
// la petición completa se caiga por una notificación.
async function notificarNuevoMiembro(proyectoId, idUsuarioNuevo, rol, quienInvita) {
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [proyectoId]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    await crearNotificacion({
      tipo: 'Invitacion',
      mensaje: `${quienInvita || 'Alguien'} te invitó a participar en el proyecto "${nombreProyecto}" como ${etiquetaFuncion(rol)}. Puedes aceptar o rechazar la invitación.`,
      entidadTipo: 'Proyecto',
      entidadId: proyectoId,
      idUsuario: idUsuarioNuevo,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar nuevo miembro:', err.message);
  }
}

// Notifica al usuario que YA PARTICIPABA (aceptado) que su función
// cambió — a diferencia de notificarNuevoMiembro, aquí no hay nada que
// aceptar o rechazar: el cambio ya se aplicó. Ver agregarMiembro: esta
// rama es la que corrige el hueco de "te invitaron" en un cambio de
// función real (docs/modelo-permisos.md, sección 15.2).
async function notificarCambioRol(proyectoId, idUsuarioObjetivo, rolNuevo, quienCambia) {
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [proyectoId]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    await crearNotificacion({
      tipo: 'PermisoNuevo',
      mensaje: `${quienCambia || 'Alguien'} cambió tu función en el proyecto "${nombreProyecto}". Ahora eres ${etiquetaFuncion(rolNuevo)}.`,
      entidadTipo: 'Proyecto',
      entidadId: proyectoId,
      idUsuario: idUsuarioObjetivo,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar cambio de función:', err.message);
  }
}

// Notifica al usuario que fue quitado del proyecto. Se saltea cuando la
// propia persona se retira (no tiene sentido avisarle a alguien que se
// fue solo) — ver la llamada en eliminarMiembro.
async function notificarRetiro(proyectoId, idUsuarioRetirado, quienQuita) {
  try {
    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [proyectoId]);
    const nombreProyecto = rows[0]?.nombre || 'un proyecto';
    await crearNotificacion({
      tipo: 'RetiroParticipante',
      mensaje: `${quienQuita || 'Alguien'} te quitó del proyecto "${nombreProyecto}".`,
      entidadTipo: 'Proyecto',
      entidadId: proyectoId,
      idUsuario: idUsuarioRetirado,
    });
  } catch (err) {
    console.error('[miembros] Error al notificar retiro:', err.message);
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
    // Peldaño mínimo 'responsable' a nivel proyecto (docs/modelo-permisos.md).
    const acceso = await resolverAccesoProyecto(req.usuario, req.params.id, 'responsable');
    if (!acceso.permitido) {
      return res.status(403).json({ mensaje: 'No tienes permisos para gestionar miembros' });
    }

    // Mismo candado que ya protege la invitación a nivel nodo — "invitado"
    // (lectura) es solo para gente ajena a la Secretaría. Antes de esto,
    // este endpoint (a diferencia de nodo-miembros.controller.js) nunca lo
    // verificaba: un interno podía quedar con rol='lectura' a nivel
    // proyecto completo sin que nada lo rechazara.
    const rechazoLectura = await rechazoLecturaParaInterno(id_usuario, rol);
    if (rechazoLectura) {
      return res.status(400).json({ error: true, mensaje: rechazoLectura, codigo: 'FUNCION_NO_APLICABLE' });
    }

    // Cambiar la función del único administrador a cualquier otro peldaño
    // deja el proyecto sin dueño igual que quitarlo. Mismo freno.
    if (rol !== 'administracion_proyecto' && await miembrosQueries.esUnicoAdministrador(req.params.id, id_usuario)) {
      return res.status(409).json({
        error: true,
        codigo: 'ULTIMO_RESPONSABLE',
        mensaje: 'Este proyecto se quedaría sin administrador. Designa antes a otra persona como administradora y vuelve a intentarlo.',
      });
    }

    // Este endpoint lo llama la UI SOLO para reasignar la función de
    // alguien que ya aparece en "Equipo del proyecto" (ver
    // ParticipanteCard::onCambiarRol en GestorUsuariosProyecto.jsx) — en
    // la práctica real nunca es una primera invitación. Pero la query de
    // abajo es un UPSERT genérico y el endpoint es alcanzable por API
    // directa, así que se detecta el caso real en vez de asumirlo: si ya
    // había una fila ACEPTADA con otra función, es un cambio de función
    // sobre alguien que ya participa (nada que aceptar o rechazar); si
    // no había fila, o estaba pendiente/rechazada, sigue siendo una
    // invitación (comportamiento sin cambios).
    const previo = await miembrosQueries.obtenerMiembro(req.params.id, id_usuario);
    const esCambioDeFuncion = previo?.estado === 'aceptada' && previo.rol !== rol;
    const sinCambioReal = previo?.estado === 'aceptada' && previo.rol === rol;

    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rol, req.usuario.id);

    if (esCambioDeFuncion) {
      await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Función actualizada', descripcion: `${req.usuario.nombre_completo} cambió la función de este miembro${await notaViaDG(acceso, req.usuario)}.`, entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_objetivo: id_usuario, rol_anterior: previo.rol, rol_nuevo: rol } });
      await notificarCambioRol(req.params.id, id_usuario, rol, req.usuario.nombre_completo);
    } else if (!sinCambioReal) {
      await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Nuevo miembro agregado al proyecto', descripcion: `Agregado por ${req.usuario.nombre_completo}${await notaViaDG(acceso, req.usuario)}.`, entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol } });
      await notificarNuevoMiembro(req.params.id, id_usuario, rol, req.usuario.nombre_completo);
    }
    res.status(201).json({ datos: miembro, mensaje: 'Miembro agregado', cambio_rol: esCambioDeFuncion });
  } catch (err) { next(err); }
}

// DELETE /proyectos/:id/miembros/:userId
async function eliminarMiembro(req, res, next) {
  try {
    const { id, userId } = req.params;
    // Un usuario siempre puede salirse por su cuenta de un proyecto —
    // mismo criterio que ya aplicaba nodo-miembros.controller.js para
    // etapas/acciones/tareas. Para quitar a alguien más sí hace falta la
    // facultad de gestionar participantes.
    const esAutoeliminacion = req.usuario?.id === userId;
    if (!esAutoeliminacion) {
      const acceso = await resolverAccesoProyecto(req.usuario, id, 'responsable');
      if (!acceso.permitido) {
        return res.status(403).json({ mensaje: 'No tienes permisos para eliminar miembros' });
      }
    }
    // Ningún proyecto debe quedarse sin administrador: sin él no hay a
    // quién avisarle las solicitudes ni quién designe participantes.
    // Aplica también cuando alguien se quita a sí mismo.
    if (await miembrosQueries.esUnicoAdministrador(id, userId)) {
      return res.status(409).json({
        error: true,
        codigo: 'ULTIMO_RESPONSABLE',
        mensaje: 'Este proyecto se quedaría sin administrador. Designa antes a otra persona como administradora y vuelve a intentarlo.',
      });
    }

    const eliminado = await miembrosQueries.eliminarMiembro(id, userId);
    if (!eliminado) return res.status(404).json({ mensaje: 'Miembro no encontrado' });
    if (userId !== req.usuario.id) {
      await notificarRetiro(id, userId, req.usuario.nombre_completo);
    }
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
    const acceso = await resolverAccesoProyecto(req.usuario, req.params.id, 'responsable');
    if (!acceso.permitido) {
      return res.status(403).json({ mensaje: 'No tienes permisos para invitar usuarios' });
    }

    const rechazoLectura = await rechazoLecturaParaInterno(id_usuario, rol);
    if (rechazoLectura) {
      return res.status(400).json({ error: true, mensaje: rechazoLectura, codigo: 'FUNCION_NO_APLICABLE' });
    }

    // Verificar que no sea ya miembro
    const { rows: existente } = await pool.query(
      'SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
      [req.params.id, id_usuario]
    );
    if (existente.length > 0) {
      return res.status(409).json({ mensaje: 'Este usuario ya es miembro del proyecto' });
    }

    const rolFinal = rol || 'captura';
    const miembro = await miembrosQueries.agregarMiembro(req.params.id, id_usuario, rolFinal, req.usuario.id);
    await registrarActividad({ id_proyecto: req.params.id, id_usuario: req.usuario.id, tipo: 'miembro', titulo: 'Usuario agregado al proyecto', descripcion: `Agregado por ${req.usuario.nombre_completo}${await notaViaDG(acceso, req.usuario)}.`, entidad_tipo: 'proyecto', entidad_id: req.params.id, metadata: { id_usuario_nuevo: id_usuario, rol: rolFinal } });
    await notificarNuevoMiembro(req.params.id, id_usuario, rolFinal, req.usuario.nombre_completo);
    res.status(201).json({ datos: miembro, mensaje: 'Usuario agregado al proyecto' });
  } catch (err) { next(err); }
}

// PATCH /admin/proyectos/:id/administrador — { id_usuario }
// Transferir la administración de un proyecto. Decisión de producto (ver
// docs/modelo-permisos.md): por ahora SOLO un superadmin puede hacerlo —
// esta función se monta en admin.routes.js, ya detrás de
// router.use(requiereRol(['superadmin'])), así que no repite ese chequeo
// aquí. El propio administrador cediéndola por su cuenta queda fuera de
// este alcance, para una versión posterior.
async function transferirAdministracionProyecto(req, res, next) {
  try {
    const { id_usuario } = req.body;
    if (!id_usuario) {
      return res.status(400).json({ error: true, mensaje: 'id_usuario es obligatorio', codigo: 'CAMPOS_REQUERIDOS' });
    }

    const resultado = await miembrosQueries.transferirAdministracion(req.params.id, id_usuario);

    const { rows } = await pool.query('SELECT nombre FROM proyectos WHERE id = $1', [req.params.id]);
    const nombreProyecto = rows[0]?.nombre || 'el proyecto';

    await registrarActividad({
      id_proyecto: req.params.id,
      id_usuario: req.usuario.id,
      tipo: 'miembro',
      titulo: 'Administración del proyecto transferida',
      descripcion: `Un superadministrador (${req.usuario.nombre_completo}) transfirió la administración a ${resultado.nombreNuevoAdministrador}.`,
      entidad_tipo: 'Proyecto',
      entidad_id: req.params.id,
      metadata: { administradores_anteriores: resultado.administradoresAnteriores, nuevo_administrador: id_usuario },
    });

    for (const idSaliente of resultado.administradoresAnteriores) {
      await crearNotificacion({
        tipo: 'PermisoNuevo',
        mensaje: `Un superadministrador transfirió la administración del proyecto "${nombreProyecto}" — ahora participas ahí como responsable.`,
        entidadTipo: 'Proyecto',
        entidadId: req.params.id,
        idUsuario: idSaliente,
      });
    }
    await crearNotificacion({
      tipo: 'PermisoNuevo',
      mensaje: `Un superadministrador te asignó como administrador(a) del proyecto "${nombreProyecto}".`,
      entidadTipo: 'Proyecto',
      entidadId: req.params.id,
      idUsuario: id_usuario,
    });

    res.json({ mensaje: 'Administración del proyecto transferida', datos: resultado });
  } catch (err) { next(err); }
}

module.exports = {
  listarMiembros,
  misInvitaciones,
  responderInvitacion,
  agregarMiembro,
  eliminarMiembro,
  crearInvitacion,
  transferirAdministracionProyecto,
};
