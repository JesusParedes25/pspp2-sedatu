/**
 * ARCHIVO: notificaciones.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de notificaciones del usuario.
 *
 * MINI-CLASE: tiempo real con SSE, no con más polling
 * ─────────────────────────────────────────────────────────────────
 * El frontend sigue consultando por polling (GET /notificaciones,
 * GET /notificaciones/resumen) como respaldo, pero ya no es la única
 * vía: GET /notificaciones/stream abre una conexión Server-Sent Events
 * de larga duración (ver utils/sse.js) por la que el backend avisa en
 * cuanto algo cambia, y el frontend refresca al instante en vez de
 * esperar al siguiente ciclo. El polling de respaldo (intervalo largo)
 * sigue existiendo por si la conexión SSE se cae — nunca fue la
 * complejidad de WebSockets lo que sobraba para esta escala, era tener
 * que mantener un canal bidireccional cuando el flujo real es de una
 * sola vía (servidor → cliente).
 * ─────────────────────────────────────────────────────────────────
 */
const notificacionesQueries = require('../db/queries/notificaciones.queries');
const miembrosQueries = require('../db/queries/miembros.queries');
const solicitudesQueries = require('../db/queries/solicitudes.queries');
const riesgosQueries = require('../db/queries/riesgos.queries');
const sse = require('../utils/sse');

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

// GET /notificaciones/stream — conexión SSE de larga duración.
//
// Sin buffering: si Nginx (o Express) juntara la respuesta antes de
// mandarla, los avisos llegarían todos de golpe al cerrarse la conexión
// en vez de en cuanto ocurren — lo contrario de "tiempo real". La
// location dedicada en nginx/default.conf ya desactiva el buffering del
// proxy; aquí se desactiva el de Express con flushHeaders().
async function stream(req, res) {
  req.socket.setTimeout(0);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(':ok\n\n');

  const desuscribir = sse.suscribir(req.usuario.id, () => res.write('data: actualizar\n\n'));

  // Ping periódico: no lleva información (el cliente lo ignora), solo
  // mantiene la conexión viva a través de cualquier proxy o balanceador
  // que cierre conexiones inactivas antes de que este backend lo haría.
  const ping = setInterval(() => res.write(':ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(ping);
    desuscribir();
  });
}

module.exports = { resumen, listar, marcarLeida, marcarTodasLeidas, stream };
