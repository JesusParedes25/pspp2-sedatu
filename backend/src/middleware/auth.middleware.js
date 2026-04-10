/**
 * ARCHIVO: auth.middleware.js
 * PROPÓSITO: Verificar que cada petición protegida traiga un JWT válido.
 *
 * MINI-CLASE: JWT (JSON Web Token)
 * ─────────────────────────────────────────────────────────────────
 * Un JWT es un string codificado en Base64 con tres partes separadas
 * por puntos: header.payload.signature. El payload contiene datos del
 * usuario (id, rol, dg). La signature se genera con JWT_SECRET y
 * garantiza que nadie alteró el payload. jwt.verify() comprueba la
 * firma y la expiración. Si es válido, adjuntamos los datos del
 * usuario a req.usuario para que las rutas siguientes lo usen.
 * ─────────────────────────────────────────────────────────────────
 */
const jwt = require('jsonwebtoken');

// Extrae y verifica el token JWT del header Authorization
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  // Aceptar token desde query param (para descargas directas vía <a href>)
  const tokenQuery = req.query.token;

  if (!tokenQuery && (!authHeader || !authHeader.startsWith('Bearer '))) {
    return res.status(401).json({
      error: true,
      mensaje: 'Token de autenticación no proporcionado',
      codigo: 'AUTH_TOKEN_MISSING'
    });
  }

  // Extraer el token del header o del query param
  const token = tokenQuery || authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Adjuntar datos del usuario al request para uso posterior
    req.usuario = {
      id: decoded.id,
      correo: decoded.correo,
      rol: decoded.rol,
      id_dg: decoded.id_dg,
      id_direccion_area: decoded.id_direccion_area,
      nombre_completo: decoded.nombre_completo
    };

    next();
  } catch (err) {
    // Token expirado o firma inválida
    const esExpirado = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: true,
      mensaje: esExpirado ? 'Token expirado, inicie sesión nuevamente' : 'Token inválido',
      codigo: esExpirado ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID'
    });
  }
}

module.exports = { verificarToken };
