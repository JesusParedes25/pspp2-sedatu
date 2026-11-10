/**
 * ARCHIVO: sesion.js
 * PROPÓSITO: Duración del token de sesión — vigencia por inactividad y
 *            techo absoluto — leídas de variables de entorno.
 *
 * NOTA TÉCNICA: dos relojes distintos
 * ─────────────────────────────────────────────────────────────────
 * JWT_INACTIVIDAD_HORAS gobierna el `exp` de CADA token (el de login y
 * el de cada renovación): si la persona no hace nada en ese tiempo, el
 * token expira solo y jwt.verify() lo rechaza en el siguiente request.
 * JWT_SESION_MAX_HORAS gobierna el endpoint de renovación (POST
 * /auth/renovar), no las peticiones normales: se mide contra el `iat`
 * ORIGINAL (el del login, que cada renovación preserva sin tocar — ver
 * auth.controller.js::renovarToken), nunca contra el `iat` del último
 * token. Pasado ese tiempo la renovación se niega aunque el token
 * todavía no haya expirado por inactividad, y hay que volver a entrar.
 *
 * Mismo patrón de normalización que BOLETO_ARCHIVO_TTL_SEGUNDOS
 * (utils/boletoArchivo.js): un valor ausente o inválido en el entorno
 * cae al valor por omisión, nunca revienta el arranque.
 * ─────────────────────────────────────────────────────────────────
 */
const INACTIVIDAD_HORAS_POR_OMISION = 8;
const SESION_MAX_HORAS_POR_OMISION = 72;

function horasValidas(valorEnv, porOmision) {
  const n = Number.parseFloat(valorEnv);
  if (!Number.isFinite(n) || n <= 0) return porOmision;
  return n;
}

function inactividadHoras() {
  return horasValidas(process.env.JWT_INACTIVIDAD_HORAS, INACTIVIDAD_HORAS_POR_OMISION);
}

function inactividadSegundos() {
  return Math.round(inactividadHoras() * 3600);
}

function sesionMaxHoras() {
  return horasValidas(process.env.JWT_SESION_MAX_HORAS, SESION_MAX_HORAS_POR_OMISION);
}

function sesionMaxSegundos() {
  return Math.round(sesionMaxHoras() * 3600);
}

module.exports = {
  inactividadSegundos,
  sesionMaxSegundos,
  INACTIVIDAD_HORAS_POR_OMISION,
  SESION_MAX_HORAS_POR_OMISION,
};
