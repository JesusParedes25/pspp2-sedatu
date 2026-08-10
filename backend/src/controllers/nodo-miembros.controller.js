/**
 * ARCHIVO: nodo-miembros.controller.js
 * PROPÓSITO: CRUD de miembros asignados a etapas y acciones específicas.
 */
const nodoMiembrosQueries = require('../db/queries/nodo-miembros.queries');
const { puedeGestionarNodo } = require('../utils/autorizacion');
const { crearNotificacion } = require('../utils/notificaciones');
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

// Notifica al usuario agregado a un nodo puntual (no lanza error: la
// membresía ya quedó creada, que es lo importante).
async function notificarNuevoMiembroNodo(tipo, idNodo, idUsuarioNuevo, rol) {
  try {
    const tabla = TABLA_POR_TIPO[tipo];
    const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [idNodo]);
    const nombreNodo = rows[0]?.nombre || 'un elemento del proyecto';
    await crearNotificacion({
      tipo: 'PermisoNuevo',
      mensaje: `Fuiste agregado a ${ETIQUETA_POR_TIPO[tipo]} "${nombreNodo}" como ${rol || 'colaborador'}.`,
      entidadTipo: ENTIDAD_TIPO_POR_TIPO[tipo],
      entidadId: idNodo,
      idUsuario: idUsuarioNuevo,
    });
  } catch (err) {
    console.error('[nodo-miembros] Error al notificar nuevo miembro:', err.message);
  }
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
    const permitido = await puedeGestionarNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para agregar miembros a este nodo', codigo: 'FORBIDDEN' });
    }
    const miembro = await nodoMiembrosQueries.agregarMiembro(tipo, idNodo, id_usuario, rol, req.usuario?.id);
    await notificarNuevoMiembroNodo(tipo, idNodo, id_usuario, rol);
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
    const permitido = await puedeGestionarNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
    if (!permitido) {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para modificar miembros de este nodo', codigo: 'FORBIDDEN' });
    }
    const miembro = await nodoMiembrosQueries.actualizarRol(tipo, idNodo, userId, rol);
    if (!miembro) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });
    res.json({ datos: miembro, mensaje: 'Rol actualizado' });
  } catch (err) {
    next(err);
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
      const permitido = await puedeGestionarNodo({ usuario: req.usuario, tipoNodo: tipo, idNodo });
      if (!permitido) {
        return res.status(403).json({ error: true, mensaje: 'No tienes permisos para quitar miembros de este nodo', codigo: 'FORBIDDEN' });
      }
    }
    const resultado = await nodoMiembrosQueries.eliminarMiembro(tipo, idNodo, userId);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });
    res.json({ datos: resultado, mensaje: 'Miembro eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, agregar, actualizar, eliminar };
