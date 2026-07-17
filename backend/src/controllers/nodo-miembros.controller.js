/**
 * ARCHIVO: nodo-miembros.controller.js
 * PROPÓSITO: CRUD de miembros asignados a etapas y acciones específicas.
 */
const nodoMiembrosQueries = require('../db/queries/nodo-miembros.queries');

// Extrae tipo ('etapa' | 'accion') del path y el id del nodo
function parseTipoId(req) {
  if (req.params.etapaId !== undefined) return { tipo: 'etapa', idNodo: req.params.etapaId };
  if (req.params.accionId !== undefined) return { tipo: 'accion', idNodo: req.params.accionId };
  return null;
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
    const miembro = await nodoMiembrosQueries.agregarMiembro(tipo, idNodo, id_usuario, rol, req.usuario?.id);
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
    const resultado = await nodoMiembrosQueries.eliminarMiembro(tipo, idNodo, userId);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'Miembro no encontrado' });
    res.json({ datos: resultado, mensaje: 'Miembro eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, agregar, actualizar, eliminar };
