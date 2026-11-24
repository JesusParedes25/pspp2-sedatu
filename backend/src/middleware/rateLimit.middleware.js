/**
 * ARCHIVO: rateLimit.middleware.js
 * PROPÓSITO: Límite de peticiones — tres perfiles independientes, cada
 *            uno configurable por variables de entorno (ver
 *            deploy/README.md).
 *
 * NOTA TÉCNICA: por qué estos tres perfiles y no uno global
 * ─────────────────────────────────────────────────────────────────
 * Un solo límite global obliga a elegir entre dejar fuera a alguien
 * trabajando normal (si es estricto) o no proteger nada de verdad (si es
 * holgado). Inicio de sesión y recuperación de contraseña son los dos
 * endpoints que vale la pena frenar en serio — ambos alcanzables sin
 * sesión, y el segundo dispara un envío real por SMTP en cada intento
 * (ver utils/correo.js) — así que llevan su propio límite estricto, por
 * IP Y por correo a la vez (alguien que rota de IP contra una sola
 * cuenta lo frena el límite por correo; alguien que prueba muchas
 * cuentas desde una sola IP lo frena el límite por IP). El resto de la
 * API autenticada lleva un límite holgado, pensado para no estorbarle a
 * nadie trabajando normal — solo corta una ráfaga real.
 *
 * NOTA TÉCNICA: por qué `trust proxy` importa aquí
 * ─────────────────────────────────────────────────────────────────
 * Cada límite de aquí usa `req.ip` (directo o en su `keyGenerator`), que
 * depende enteramente de `app.set('trust proxy', N)` en server.js. Sin
 * ese ajuste correcto, Express ve como "cliente" la IP del proxy más
 * cercano — todo el tráfico cae en una sola IP y la primera ráfaga
 * agota la cuota para todo el mundo. Ver server.js para el valor por
 * omisión y cómo se configura por ambiente (PROXY_SALTOS_CONFIABLES).
 */
const rateLimit = require('express-rate-limit');

function minutosEnMs(variable, porOmisionMin) {
  const n = Number.parseInt(process.env[variable], 10);
  const minutos = Number.isFinite(n) && n > 0 ? n : porOmisionMin;
  return minutos * 60 * 1000;
}

function entero(variable, porOmision) {
  const n = Number.parseInt(process.env[variable], 10);
  return Number.isFinite(n) && n > 0 ? n : porOmision;
}

function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase();
}

// Segundos hasta que la ventana de este cliente se reinicie — lo que el
// frontend necesita para decir "espera X" en vez de un genérico "inténtalo
// de nuevo" (ver mensajeDeError en frontend/src/api/transferencias.js).
function segundosParaReintentar(req) {
  const resetTime = req.rateLimit?.resetTime;
  if (!resetTime) return null;
  return Math.max(1, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000));
}

function manejador(mensaje) {
  return (req, res) => {
    res.status(429).json({
      error: true,
      codigo: 'DEMASIADAS_PETICIONES',
      mensaje,
      reintentar_en_segundos: segundosParaReintentar(req),
    });
  };
}

// Sin la espera concreta en el texto a propósito: el frontend la arma con
// el número real que manda `reintentar_en_segundos` (ver mensajeDeError en
// frontend/src/api/transferencias.js) — un "espera unos minutos" fijo
// aquí quedaría repetido al pegarse con ese cálculo.
const MENSAJE_LOGIN = 'Demasiados intentos de inicio de sesión.';
const MENSAJE_RECUPERACION = 'Demasiadas solicitudes de recuperación de contraseña.';
const MENSAJE_API = 'Demasiadas peticiones en poco tiempo.';

const opcionesBase = { standardHeaders: true, legacyHeaders: false };

// ─── Inicio de sesión — estricto, por IP y por correo ──────────────
const limiteLoginPorIp = rateLimit({
  ...opcionesBase,
  windowMs: minutosEnMs('LIMITE_PETICIONES_LOGIN_VENTANA_MIN', 15),
  max: entero('LIMITE_PETICIONES_LOGIN_MAX', 10),
  handler: manejador(MENSAJE_LOGIN),
});

const limiteLoginPorCorreo = rateLimit({
  ...opcionesBase,
  windowMs: minutosEnMs('LIMITE_PETICIONES_LOGIN_VENTANA_MIN', 15),
  max: entero('LIMITE_PETICIONES_LOGIN_MAX', 10),
  // Sin correo en el body, el controller ya responde 400 de inmediato
  // (ver auth.controller.js::login) — no hace falta ni tiene sentido
  // contar ese intento contra un bucket compartido.
  skip: (req) => !req.body?.correo,
  keyGenerator: (req) => `correo:${normalizarCorreo(req.body.correo)}`,
  handler: manejador(MENSAJE_LOGIN),
});

// ─── Recuperación de contraseña — estricto, por IP y por correo ────
const limiteRecuperacionPorIp = rateLimit({
  ...opcionesBase,
  windowMs: minutosEnMs('LIMITE_PETICIONES_RECUPERACION_VENTANA_MIN', 60),
  max: entero('LIMITE_PETICIONES_RECUPERACION_MAX', 5),
  handler: manejador(MENSAJE_RECUPERACION),
});

const limiteRecuperacionPorCorreo = rateLimit({
  ...opcionesBase,
  windowMs: minutosEnMs('LIMITE_PETICIONES_RECUPERACION_VENTANA_MIN', 60),
  max: entero('LIMITE_PETICIONES_RECUPERACION_MAX', 5),
  skip: (req) => !req.body?.correo,
  keyGenerator: (req) => `correo:${normalizarCorreo(req.body.correo)}`,
  handler: manejador(MENSAJE_RECUPERACION),
});

// ─── Resto de la API autenticada — holgado ─────────────────────────
// Por usuario cuando ya pasó verificarToken (siempre, dado dónde se monta
// — ver routes/index.js), por IP como respaldo. Deja fuera la ruta de
// notificaciones en tiempo real (SSE): es una sola petición GET que se
// queda abierta horas (ver utils/sse.js) — contarla como una petición
// más no tiene sentido, y una reconexión del navegador tras un corte de
// red no debe gastar la misma cuota que el resto de la API.
const limiteApiGeneral = rateLimit({
  ...opcionesBase,
  windowMs: minutosEnMs('LIMITE_PETICIONES_API_VENTANA_MIN', 15),
  max: entero('LIMITE_PETICIONES_API_MAX', 600),
  keyGenerator: (req) => req.usuario?.id || req.ip,
  skip: (req) => req.path === '/notificaciones/stream',
  handler: manejador(MENSAJE_API),
});

module.exports = {
  limiteLoginPorIp,
  limiteLoginPorCorreo,
  limiteRecuperacionPorIp,
  limiteRecuperacionPorCorreo,
  limiteApiGeneral,
};
