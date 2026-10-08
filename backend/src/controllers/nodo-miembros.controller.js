/**
 * ARCHIVO: nodo-miembros.controller.js
 * PROPÓSITO: CRUD de miembros asignados a etapas y acciones específicas.
 */
const nodoMiembrosQueries = require('../db/queries/nodo-miembros.queries');
const { puedeGestionarParticipantesNodo, obtenerProyectoIdDeNodo } = require('../utils/autorizacion');
const miembrosQueries = require('../db/queries/miembros.queries');
const { crearNotificacion } = require('../utils/notificaciones');
const { registrarActividad } = require('../utils/actividad-log');
const pool = require('../db/pool');

// Extrae tipo ('etapa' | 'accion') del path y el id del nodo
function parseTipoId(req) {
  if (req.params.etapaId !== undefined) return { tipo: 'etapa', idNodo: req.params.etapaId };
  if (req.params.accionId !== undefined) return { tipo: 'accion', idNodo: req.params.accionId };
  if (req.params.tareaId !== undefined) return { tipo: 'tarea', idNodo: req.params.tareaId };
  return null;
}

const TABLA_POR_TIPO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };
const ENTIDAD_TIPO_POR_TIPO = { etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' };
const ETIQUETA_POR_TIPO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };
const ETIQUETA_ROL = { responsable: 'responsable', colaborador: 'colaborador', invitado: 'invitado' };

// Nombre del nodo (etapa/acción/tarea) por id — compartido entre las
// notificaciones y los eventos de bitácora de este archivo, para no
// repetir la misma consulta con 3 redacciones distintas.
async function nombreDeNodo(tipo, idNodo) {
  const tabla = TABLA_POR_TIPO[tipo];
  const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [idNodo]);
  return rows[0]?.nombre || 'un elemento del proyecto';
}

async function nombreDeUsuario(idUsuario) {
  const { rows } = await pool.query('SELECT nombre_completo FROM usuarios WHERE id = $1', [idUsuario]);
  return rows[0]?.nombre_completo || 'un usuario';
}

// Registra en actividad_log (bitácora) un cambio de equipo a nivel de
// nodo — hoy el único rastro de "quién le dio/quitó acceso a quién, en
// qué etapa/acción/tarea y cuándo". Antes de esto, quitar o agregar a
// alguien en un nodo específico no dejaba ningún registro: si en tres
// meses alguien reclamaba que le quitaron el acceso, no había forma de
// saber quién fue ni cuándo.
async function registrarActividadEquipoNodo({ tipo, idNodo, idProyecto, actor, titulo, descripcion }) {
  if (!idProyecto) return;
  await registrarActividad({
    id_proyecto: idProyecto,
    id_usuario: actor?.id || null,
    tipo: 'miembro',
    titulo,
    descripcion,
    entidad_tipo: ENTIDAD_TIPO_POR_TIPO[tipo],
    entidad_id: idNodo,
  });
}

// Notifica al usuario agregado a un nodo puntual (no lanza error: la
// membresía ya quedó creada, que es lo importante).
async function notificarNuevoMiembroNodo(tipo, idNodo, idUsuarioNuevo, rol, quienInvita) {
  try {
    const nombreNodo = await nombreDeNodo(tipo, idNodo);
    await crearNotificacion({
      tipo: 'Invitacion',
      mensaje: `${quienInvita || 'Alguien'} te invitó a ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}" como ${rol || 'colaborador'}. Puedes aceptar o rechazar la invitación.`,
      entidadTipo: ENTIDAD_TIPO_POR_TIPO[tipo],
      entidadId: idNodo,
      idUsuario: idUsuarioNuevo,
    });
  } catch (err) {
    console.error('[nodo-miembros] Error al notificar nuevo miembro:', err.message);
  }
}

// Avisa a quien invitó cómo le fue.
async function notificarRespuestaNodo({ idQuienInvito, nombreQuienResponde, acepta, funcion, tipo, idNodo, motivo }) {
  if (!idQuienInvito) return;
  try {
    const tabla = TABLA_POR_TIPO[tipo];
    const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [idNodo]);
    const nombreNodo = rows[0]?.nombre || 'un elemento del proyecto';
    const verbo = acepta ? 'aceptó' : 'rechazó';
    const base = `${nombreQuienResponde} ${verbo} tu invitación para ser ${funcion} en ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}".`;
    await crearNotificacion({
      tipo: 'RespuestaInvitacion',
      mensaje: acepta ? base : `${base} Motivo: ${motivo}`,
      entidadTipo: ENTIDAD_TIPO_POR_TIPO[tipo],
      entidadId: idNodo,
      idUsuario: idQuienInvito,
    });
  } catch (err) {
    console.error('[nodo-miembros] Error al notificar respuesta:', err.message);
  }
}

// POST /etapas|acciones|tareas/:id/miembros-nodo/responder
// Body: { respuesta: 'aceptar'|'rechazar', motivo }
async function responder(req, res, next) {
  try {
    const { tipo, idNodo } = parseTipoId(req);
    const { respuesta, motivo } = req.body || {};
    if (!['aceptar', 'rechazar'].includes(respuesta)) {
      return res.status(400).json({ error: true, mensaje: "respuesta debe ser 'aceptar' o 'rechazar'" });
    }
    const acepta = respuesta === 'aceptar';
    if (!acepta && !(motivo || '').trim()) {
      return res.status(400).json({ error: true, mensaje: 'Para rechazar la invitación explica brevemente el motivo.' });
    }

    const fila = await nodoMiembrosQueries.responderInvitacion(
      tipo, idNodo, req.usuario.id, acepta, (motivo || '').trim()
    );
    if (!fila) {
      return res.status(404).json({ error: true, mensaje: 'No tienes una invitación pendiente aquí.' });
    }

    await notificarRespuestaNodo({
      idQuienInvito: fila.id_invitado_por,
      nombreQuienResponde: req.usuario.nombre_completo,
      acepta,
      funcion: fila.rol,
      tipo,
      idNodo,
      motivo,
    });

    res.json({ datos: fila, mensaje: acepta ? 'Invitación aceptada' : 'Invitación rechazada' });
  } catch (err) { next(err); }
}

// La función 'invitado' —ver sin capturar— existe para personas ajenas a
// la Secretaría: alguien de otra dependencia a quien se le abre una parte
// del proyecto para que le dé seguimiento. Para el personal de SEDATU no
// tiene sentido: la visibilidad ya es total, así que "invitarlo sin poder
// capturar" no le agrega nada.
async function invitadoSoloParaExternos(idUsuario, rol) {
  if (rol !== 'invitado') return null;
  const { rows } = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [idUsuario]);
  if (rows[0]?.rol === 'externo') return null;
  return 'La función "invitado" es solo para usuarios externos a la Secretaría. '
    + 'Para personal de SEDATU usa responsable o colaborador.';
}

// GET /etapas/:etapaId/miembros-nodo
// GET /acciones/:accionId/miembros-nodo
async function listar(req, res, next) {
  try {
    const { tipo, idNodo } = parseTipoId(req);
    const miembros = await nodoMiembrosQueries.listarMiembros(tipo, idNodo);
    res.json({ datos: miembros, mensaje: 'Miembros obtenidos' });
  } catch (err) {
    next(err);
  }
}

// POST /etapas/:etapaId/miembros-nodo
// POST /acciones/:accionId/miembros-nodo
// Body: { id_usuario, rol }
async function agregar(req, res, next) {
  try {
    const { tipo, idNodo } = parseTipoId(req);
    const { id_usuario, rol } = req.body;
    if (!id_usuario) return res.status(400).json({ error: true, mensaje: 'Se requiere id_usuario' });
    const roles = ['responsable', 'colaborador', 'invitado'];
    if (rol && !roles.includes(rol)) {
      return res.status(400).json({ error: true, mensaje: `rol debe ser uno de: ${roles.join(', ')}` });
    }
    const permitido = await puedeGestionarParticipantesNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para agregar miembros a este nodo', codigo: 'FORBIDDEN' });
    }

    const rechazoInvitado = await invitadoSoloParaExternos(id_usuario, rol);
    if (rechazoInvitado) {
      return res.status(400).json({ error: true, mensaje: rechazoInvitado, codigo: 'FUNCION_NO_APLICABLE' });
    }

    // Invitar a una etapa suelta a quien ya participa en TODO el proyecto no
    // agrega nada y confunde: aparecería dos veces con dos alcances. Se
    // rechaza explicando por qué, para que quien invita entienda que esa
    // persona ya tiene acceso a todo.
    const idProyecto = await obtenerProyectoIdDeNodo(tipo, idNodo);
    if (idProyecto) {
      const funcionEnProyecto = await miembrosQueries.obtenerRolUsuario(idProyecto, id_usuario);
      if (funcionEnProyecto) {
        return res.status(409).json({
          error: true,
          codigo: 'YA_PARTICIPA_EN_PROYECTO',
          funcion_en_proyecto: funcionEnProyecto,
          mensaje: `Esta persona ya participa en todo el proyecto como ${funcionEnProyecto}, así que ya puede trabajar aquí. `
            + 'Para acotar su acceso a una parte, primero retírala del proyecto y vuelve a invitarla solo a lo que le corresponde.',
        });
      }
    }

    const miembro = await nodoMiembrosQueries.agregarMiembro(tipo, idNodo, id_usuario, rol, req.usuario?.id);
    await notificarNuevoMiembroNodo(tipo, idNodo, id_usuario, rol, req.usuario?.nombre_completo);

    const [nombreNodo, nombreObjetivo] = await Promise.all([nombreDeNodo(tipo, idNodo), nombreDeUsuario(id_usuario)]);
    const etiquetaRol = ETIQUETA_ROL[rol] || rol || 'colaborador';
    await registrarActividadEquipoNodo({
      tipo, idNodo, idProyecto, actor: req.usuario,
      titulo: `${nombreObjetivo} agregado a ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}"`,
      descripcion: `${req.usuario?.nombre_completo || 'Alguien'} agregó a ${nombreObjetivo} como ${etiquetaRol} en ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}".`,
    });

    res.status(201).json({ datos: miembro, mensaje: 'Miembro agregado' });
  } catch (err) {
    next(err);
  }
}

// PUT /etapas/:etapaId/miembros-nodo/:userId
// PUT /acciones/:accionId/miembros-nodo/:userId
// Body: { rol }
async function actualizar(req, res, next) {
  try {
    const { tipo, idNodo } = parseTipoId(req);
    const { userId } = req.params;
    const { rol } = req.body;
    const roles = ['responsable', 'colaborador', 'invitado'];
    if (!rol || !roles.includes(rol)) {
      return res.status(400).json({ error: true, mensaje: `rol debe ser uno de: ${roles.join(', ')}` });
    }
    const permitido = await puedeGestionarParticipantesNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para modificar miembros de este nodo', codigo: 'FORBIDDEN' });
    }
    const rechazoInvitado = await invitadoSoloParaExternos(userId, rol);
    if (rechazoInvitado) {
      return res.status(400).json({ error: true, mensaje: rechazoInvitado, codigo: 'FUNCION_NO_APLICABLE' });
    }
    const previo = await nodoMiembrosQueries.obtenerMiembro(tipo, idNodo, userId);
    const miembro = await nodoMiembrosQueries.actualizarRol(tipo, idNodo, userId, rol);
    if (!miembro) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });

    const idProyecto = await obtenerProyectoIdDeNodo(tipo, idNodo);
    const [nombreNodo, nombreObjetivo] = await Promise.all([nombreDeNodo(tipo, idNodo), nombreDeUsuario(userId)]);
    const etiquetaNueva = ETIQUETA_ROL[rol] || rol;
    const etiquetaPrevia = previo ? (ETIQUETA_ROL[previo.rol] || previo.rol) : null;
    await registrarActividadEquipoNodo({
      tipo, idNodo, idProyecto, actor: req.usuario,
      titulo: `Función de ${nombreObjetivo} cambiada a ${etiquetaNueva} en ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}"`,
      descripcion: `${req.usuario?.nombre_completo || 'Alguien'} cambió la función de ${nombreObjetivo} en ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}"`
        + (etiquetaPrevia && etiquetaPrevia !== etiquetaNueva ? ` de ${etiquetaPrevia} a ${etiquetaNueva}.` : ` a ${etiquetaNueva}.`),
    });

    res.json({ datos: miembro, mensaje: 'Rol actualizado' });
  } catch (err) {
    next(err);
  }
}

// Notifica al usuario que fue quitado de un nodo puntual. Se saltea en
// autoeliminación — ver la llamada en eliminar().
async function notificarRetiroNodo(tipo, idNodo, idUsuarioRetirado, quienQuita) {
  try {
    const tabla = TABLA_POR_TIPO[tipo];
    const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [idNodo]);
    const nombreNodo = rows[0]?.nombre || 'un elemento del proyecto';
    await crearNotificacion({
      tipo: 'RetiroParticipante',
      mensaje: `${quienQuita || 'Alguien'} te quitó de ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}".`,
      entidadTipo: ENTIDAD_TIPO_POR_TIPO[tipo],
      entidadId: idNodo,
      idUsuario: idUsuarioRetirado,
    });
  } catch (err) {
    console.error('[nodo-miembros] Error al notificar retiro:', err.message);
  }
}

// DELETE /etapas/:etapaId/miembros-nodo/:userId
// DELETE /acciones/:accionId/miembros-nodo/:userId
async function eliminar(req, res, next) {
  try {
    const { tipo, idNodo } = parseTipoId(req);
    const { userId } = req.params;
    // Un usuario siempre puede quitarse a sí mismo del nodo; para quitar a
    // alguien más se requiere permiso de gestión sobre el proyecto/nodo.
    const esAutoeliminacion = req.usuario?.id === userId;
    if (!esAutoeliminacion) {
      const permitido = await puedeGestionarParticipantesNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
      if (!permitido) {
        return res.status(403).json({ error: true, mensaje: 'No tienes permisos para quitar miembros de este nodo', codigo: 'FORBIDDEN' });
      }
    }
    // Se resuelve quién era (rol) y se registra en la bitácora ANTES de
    // borrar la fila — igual que se corrigió para indicador_aportaciones:
    // una vez borrada, no queda ningún rastro de qué función tenía ni de
    // que el acceso haya existido. Si la fila no existe, el 404 sale aquí,
    // sin tocar actividad_log por algo que no pasó.
    const previo = await nodoMiembrosQueries.obtenerMiembro(tipo, idNodo, userId);
    if (!previo) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });

    const idProyecto = await obtenerProyectoIdDeNodo(tipo, idNodo);
    const [nombreNodo, nombreObjetivo] = await Promise.all([nombreDeNodo(tipo, idNodo), nombreDeUsuario(userId)]);
    const etiquetaRol = ETIQUETA_ROL[previo.rol] || previo.rol;
    await registrarActividadEquipoNodo({
      tipo, idNodo, idProyecto, actor: req.usuario,
      titulo: `${nombreObjetivo} quitado de ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}"`,
      descripcion: esAutoeliminacion
        ? `${nombreObjetivo} se quitó a sí mismo (${etiquetaRol}) de ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}".`
        : `${req.usuario?.nombre_completo || 'Alguien'} quitó a ${nombreObjetivo} (${etiquetaRol}) de ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}".`,
    });

    const resultado = await nodoMiembrosQueries.eliminarMiembro(tipo, idNodo, userId);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });
    if (!esAutoeliminacion) {
      await notificarRetiroNodo(tipo, idNodo, userId, req.usuario?.nombre_completo);
    }
    res.json({ datos: resultado, mensaje: 'Miembro eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, agregar, actualizar, eliminar, responder };
