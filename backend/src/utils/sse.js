/**
 * ARCHIVO: sse.js
 * PROPÓSITO: Bus de eventos en memoria para avisar en tiempo real a un
 *            usuario conectado que su buzón de notificaciones cambió.
 *
 * MINI-CLASE: por qué un EventEmitter y no Redis/WebSockets
 * ─────────────────────────────────────────────────────────────────
 * El backend corre como un solo proceso (un contenedor `backend`, sin
 * réplicas — ver docker-compose.prod.yml), así que no hace falta un
 * bus externo compartido entre instancias: un EventEmitter en memoria
 * de Node ya conecta "algo pasó" con "quién está escuchando" dentro
 * del mismo proceso. Si algún día el backend escala a varias réplicas,
 * esto tendría que moverse a un pub/sub externo (Redis, por ejemplo) —
 * no antes, porque sería complejidad sin beneficio actual.
 *
 * Se usa Server-Sent Events (un solo GET de larga duración) en vez de
 * WebSockets porque la relación es de una sola vía (servidor → cliente,
 * "algo cambió, vuelve a pedir tus notificaciones") y SSE corre sobre
 * HTTP normal — sin manejar un protocolo de upgrade aparte, sin
 * librería nueva, y ya funciona a través del mismo proxy de Nginx que
 * el resto de /api/ (ver nginx/default.conf, location dedicada con
 * proxy_buffering off).
 *
 * El payload del evento es deliberadamente vacío ("algo cambió, vuelve
 * a pedir"): mandar el dato completo por aquí duplicaría la lógica de
 * armar la respuesta que ya vive en notificaciones.controller.js
 * (resumen/listar). Un aviso + un refetch es más simple que mantener
 * dos caminos para la misma información.
 * ─────────────────────────────────────────────────────────────────
 */
const { EventEmitter } = require('events');

const bus = new EventEmitter();
// Cada usuario conectado desde varias pestañas suma un listener al mismo
// canal — sin subir el límite, Node empezaría a advertir "posible fuga de
// memoria" a partir del listener número 11, que aquí es una situación
// normal (alguien con el buzón abierto en dos pestañas), no una fuga.
bus.setMaxListeners(0);

function canalDe(idUsuario) {
  return `usuario:${idUsuario}`;
}

// Avisa a todas las conexiones SSE abiertas de este usuario que hay algo
// nuevo que ir a buscar (notificación, invitación, solicitud, asignación).
function avisarUsuario(idUsuario) {
  if (!idUsuario) return;
  bus.emit(canalDe(idUsuario), 'actualizar');
}

// Suscribe un callback al canal de un usuario. Devuelve la función para
// desuscribirse — se llama cuando la conexión SSE se cierra.
function suscribir(idUsuario, callback) {
  const canal = canalDe(idUsuario);
  bus.on(canal, callback);
  return () => bus.off(canal, callback);
}

module.exports = { avisarUsuario, suscribir };
