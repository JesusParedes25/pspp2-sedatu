/**
 * ARCHIVO: notificaciones.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de notificaciones del usuario.
 *
 * MINI-CLASE: Polling vs WebSockets para notificaciones
 * ─────────────────────────────────────────────────────────────────
 * En esta versión, el frontend consulta las notificaciones cada 30
 * segundos con polling (GET /notificaciones). Esto es simple y
 * funcional para un sistema institucional con decenas de usuarios.
 * WebSockets (notificaciones en tiempo real) sería más eficiente
 * para miles de usuarios, pero agrega complejidad innecesaria en
 * esta escala. El badge del header usa contarNoLeidas() para
 * mostrar el número sin cargar todas las notificaciones.
 * ─────────────────────────────────────────────────────────────────
 */
const notificacionesQueries = require('../db/queries/notificaciones.queries');

// GET /notificaciones — Listar notificaciones del usuario autenticado
async function listar(req, res, next) {
  try {
    const notificaciones = await notificacionesQueries.obtenerNotificaciones(req.usuario.id);
    const noLeidas = await notificacionesQueries.contarNoLeidas(req.usuario.id);

    res.json({
      datos: { notificaciones, no_leidas: noLeidas },
      mensaje: 'Notificaciones obtenidas'
    });
  } catch (err) {
    next(err);
  }
}

// PUT /notificaciones/:id/leer — Marcar una notificación como leída
async function marcarLeida(req, res, next) {
  try {
    const notificacion = await notificacionesQueries.marcarLeida(req.params.id);

    if (!notificacion) {
      return res.status(404).json({
        error: true,
        mensaje: 'Notificación no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: notificacion, mensaje: 'Notificación marcada como leída' });
  } catch (err) {
    next(err);
  }
}

// PUT /notificaciones/leer-todas — Marcar todas como leídas
async function marcarTodasLeidas(req, res, next) {
  try {
    const cantidad = await notificacionesQueries.marcarTodasLeidas(req.usuario.id);
    res.json({ datos: { marcadas: cantidad }, mensaje: `${cantidad} notificación(es) marcadas como leídas` });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, marcarLeida, marcarTodasLeidas };
