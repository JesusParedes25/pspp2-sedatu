/**
 * ARCHIVO: bloqueos.controller.js
 * PROPÓSITO: Endpoints HTTP para consultar y resolver bloqueos.
 *
 * MINI-CLASE: Bloqueos como recurso independiente
 * ─────────────────────────────────────────────────────────────────
 * La creación de bloqueos ocurre automáticamente dentro de
 * cambiarEstado() (validaciones-estado.js) al pasar a 'Bloqueada'.
 * Este controller expone solo las consultas (historial, activo)
 * y la resolución manual de un bloqueo por su ID.
 * ─────────────────────────────────────────────────────────────────
 */
const bloqueosQueries = require('../db/queries/bloqueos.queries');

async function listarHistorial(req, res) {
  const { entidad_tipo, entidad_id } = req.query;
  if (!entidad_tipo || !entidad_id) {
    return res.status(400).json({
      mensaje: 'Parámetros requeridos: entidad_tipo, entidad_id'
    });
  }
  const historial = await bloqueosQueries.listarHistorial(entidad_tipo, entidad_id);
  res.json({ datos: historial });
}

async function obtenerActivo(req, res) {
  const { entidad_tipo, entidad_id } = req.query;
  if (!entidad_tipo || !entidad_id) {
    return res.status(400).json({
      mensaje: 'Parámetros requeridos: entidad_tipo, entidad_id'
    });
  }
  const bloqueo = await bloqueosQueries.obtenerBloqueoActivo(entidad_tipo, entidad_id);
  res.json({ datos: bloqueo });
}

async function resolverBloqueo(req, res) {
  const { id } = req.params;
  const { nota_resolucion } = req.body;
  const idUsuario = req.usuario?.id;

  if (!nota_resolucion) {
    return res.status(400).json({
      mensaje: 'nota_resolucion es requerida para resolver un bloqueo'
    });
  }

  const resuelto = await bloqueosQueries.resolverPorId(id, nota_resolucion, idUsuario);
  if (!resuelto) {
    return res.status(404).json({
      mensaje: 'Bloqueo no encontrado o ya resuelto'
    });
  }
  res.json({ datos: resuelto, mensaje: 'Bloqueo resuelto' });
}

module.exports = { listarHistorial, obtenerActivo, resolverBloqueo };
