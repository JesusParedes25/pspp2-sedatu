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
const miembrosQueries = require('../db/queries/miembros.queries');
const solicitudesQueries = require('../db/queries/solicitudes.queries');
const riesgosQueries = require('../db/queries/riesgos.queries');

// GET /notificaciones/resumen — para la campanita del header.
//
// La campanita solo contaba avisos sin leer (tabla `notificaciones`),
// pero una invitación o una solicitud por resolver no son avisos: son
// pendientes que requieren una acción, y viven en sus propias tablas.
// Alguien con una solicitud esperando veía la campanita en cero y
// pensaba que no había nada — el número tiene que sumar las tres cosas
// para que sea confiable.
//
// Se reutilizan las mismas consultas que ya arman la página de
// Notificaciones (invitacionesPendientes, pendientesQuePuedeResolver) en
// vez de escribir un COUNT(*) aparte con el mismo WHERE duplicado: si la
// regla de quién puede resolver una solicitud cambia, esta cuenta cambia
// sola con ella en lugar de quedarse atrás.
async function resumen(req, res, next) {
  try {
    const [noLeidas, invitaciones, solicitudes, asignacionesRiesgo] = await Promise.all([
      notificacionesQueries.contarNoLeidasParaCampanita(req.usuario.id),
      miembrosQueries.invitacionesPendientes(req.usuario.id),
      solicitudesQueries.pendientesQuePuedeResolver(req.usuario),
      riesgosQueries.asignacionesPendientesDe(req.usuario.id),
    ]);

    const datos = {
      no_leidas: noLeidas,
      invitaciones: invitaciones.length,
      solicitudes: solicitudes.length,
      asignaciones_riesgo: asignacionesRiesgo.length,
    };
    datos.total = datos.no_leidas + datos.invitaciones + datos.solicitudes + datos.asignaciones_riesgo;

    res.json({ datos, mensaje: 'Resumen de pendientes' });
  } catch (err) {
    next(err);
  }
}

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

module.exports = { resumen, listar, marcarLeida, marcarTodasLeidas };
