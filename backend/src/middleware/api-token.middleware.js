/**
 * ARCHIVO: api-token.middleware.js
 * PROPÓSITO: Autenticar peticiones de la API pública con un token de
 *            servicio en vez de la sesión de un usuario.
 *
 * Se acepta el token por `Authorization: Bearer <token>` o por el
 * encabezado `X-API-Key`. Lo primero es lo estándar; lo segundo existe
 * porque varias herramientas de tablero solo permiten configurar un
 * encabezado fijo y no un esquema Bearer.
 */
const apiTokens = require('../db/queries/api-tokens.queries');

function extraerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return (req.headers['x-api-key'] || '').trim() || null;
}

async function requiereApiToken(req, res, next) {
  try {
    const token = extraerToken(req);
    if (!token) {
      return res.status(401).json({
        error: true,
        mensaje: 'Falta el token de servicio. Envíalo como "Authorization: Bearer <token>" o "X-API-Key: <token>".',
        codigo: 'TOKEN_REQUERIDO',
      });
    }

    const registro = await apiTokens.verificar(token);
    if (!registro) {
      // No se distingue entre "no existe" y "revocado": a quien no tiene
      // una credencial válida no se le da información sobre cuáles lo son.
      return res.status(401).json({
        error: true,
        mensaje: 'Token de servicio inválido o revocado',
        codigo: 'TOKEN_INVALIDO',
      });
    }

    req.apiToken = registro;
    next();
  } catch (err) { next(err); }
}

module.exports = { requiereApiToken };
