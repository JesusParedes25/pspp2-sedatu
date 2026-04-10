/**
 * ARCHIVO: comentarios.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de comentarios (inmutables).
 *
 * MINI-CLASE: Comentarios como registro inmutable
 * ─────────────────────────────────────────────────────────────────
 * Los comentarios en PSPP son inmutables por diseño institucional:
 * una vez publicados, no se pueden editar ni eliminar. Esto
 * garantiza que el historial de comunicación entre DGs sea íntegro
 * y auditable. Solo se permiten operaciones de lectura (GET) y
 * creación (POST). El endpoint de responder crea un nuevo comentario
 * vinculado al padre mediante id_comentario_padre.
 * ─────────────────────────────────────────────────────────────────
 */
const comentariosQueries = require('../db/queries/comentarios.queries');
const { crearNotificacion } = require('../utils/notificaciones');

// GET /comentarios?entidad_tipo=X&entidad_id=UUID — Listar comentarios
async function listar(req, res, next) {
  try {
    const { entidad_tipo, entidad_id } = req.query;

    if (!entidad_tipo || !entidad_id) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere entidad_tipo y entidad_id',
        codigo: 'CAMPOS_REQUERIDOS'
      });
    }

    const comentarios = await comentariosQueries.obtenerComentarios(entidad_tipo, entidad_id);
    res.json({ datos: comentarios, mensaje: 'Comentarios obtenidos' });
  } catch (err) {
    next(err);
  }
}

// POST /comentarios — Crear un comentario nuevo
async function crear(req, res, next) {
  try {
    const { entidad_tipo, entidad_id, contenido } = req.body;

    if (!entidad_tipo || !entidad_id || !contenido) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere entidad_tipo, entidad_id y contenido',
        codigo: 'CAMPOS_REQUERIDOS'
      });
    }

    const comentario = await comentariosQueries.crearComentario({
      entidad_tipo,
      entidad_id,
      contenido,
      id_autor: req.usuario.id
    });

    res.status(201).json({ datos: comentario, mensaje: 'Comentario creado' });
  } catch (err) {
    next(err);
  }
}

// POST /comentarios/:id/responder — Responder a un comentario
async function responder(req, res, next) {
  try {
    const { contenido } = req.body;

    if (!contenido) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere contenido',
        codigo: 'CAMPOS_REQUERIDOS'
      });
    }

    const respuesta = await comentariosQueries.responderComentario(req.params.id, {
      contenido,
      id_autor: req.usuario.id
    });

    res.status(201).json({ datos: respuesta, mensaje: 'Respuesta creada' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, responder };
