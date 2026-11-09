/**
 * ARCHIVO: auth.middleware.js
 * PROPÓSITO: Verificar que cada petición protegida traiga un JWT válido.
 *
 * NOTA TÉCNICA: JWT (JSON Web Token)
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
const { verificarBoleto, ErrorBoleto } = require('../utils/boletoArchivo');

function responder401(res, mensaje, codigo) {
  return res.status(401).json({ error: true, mensaje, codigo });
}

// Verifica un token de SESIÓN y devuelve el usuario. Rechaza cualquier JWT
// que declare un propósito propio (claim `prp`, p. ej. un boleto de
// archivo): un boleto no es una sesión aunque, por un error de
// configuración, llegara a pasar la firma.
function verificarTokenSesion(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.prp !== undefined) {
    const err = new Error('Token con propósito distinto de sesión');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return {
    id: decoded.id,
    correo: decoded.correo,
    rol: decoded.rol,
    id_dg: decoded.id_dg,
    id_direccion_area: decoded.id_direccion_area,
    nombre_completo: decoded.nombre_completo
  };
}

function responderErrorSesion(res, err) {
  const esExpirado = err.name === 'TokenExpiredError';
  return responder401(
    res,
    esExpirado ? 'Token expirado, inicie sesión nuevamente' : 'Token inválido',
    esExpirado ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID'
  );
}

function tokenDeCabecera(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

// Extrae y verifica el token JWT del header Authorization.
//
// SOLO de la cabecera. Antes también se aceptaba ?token=<JWT> en la query
// "para descargas directas vía <a href>": eso escribía la sesión completa
// (48 h) en la bitácora de cada proxy que registra URLs (en SEDATU: F5,
// nginx institucional y contenedor). Las descargas ahora usan un boleto
// efímero (ver autenticarArchivo abajo y utils/boletoArchivo.js).
function verificarToken(req, res, next) {
  const token = tokenDeCabecera(req);
  if (!token) {
    return responder401(res, 'Token de autenticación no proporcionado', 'AUTH_TOKEN_MISSING');
  }

  try {
    // Adjuntar datos del usuario al request para uso posterior
    req.usuario = verificarTokenSesion(token);
    next();
  } catch (err) {
    // Token expirado, firma inválida o JWT que no es de sesión
    return responderErrorSesion(res, err);
  }
}

// Autenticación de los endpoints que transmiten un archivo
// (/evidencias/:id/ver|descargar, /actividad/:id/ver|descargar).
// Acepta exactamente dos vías:
//   1. Cabecera Authorization con el token de sesión (clientes que pueden
//      mandarla: axios, fetch, scripts).
//   2. ?boleto=<boleto> emitido para ESTE tipo de objeto, ESTE id y ESTA
//      acción, todavía vigente.
// Nada más: un token de sesión en la URL (?token= o ?boleto=) no sirve.
function autenticarArchivo(tipo, accion, param = 'id') {
  return function autenticarArchivoMiddleware(req, res, next) {
    const token = tokenDeCabecera(req);
    if (token) {
      try {
        req.usuario = verificarTokenSesion(token);
        return next();
      } catch (err) {
        return responderErrorSesion(res, err);
      }
    }

    const boleto = typeof req.query.boleto === 'string' ? req.query.boleto : null;
    if (!boleto) {
      return responder401(res, 'Se requiere autenticación para abrir este archivo', 'AUTH_TOKEN_MISSING');
    }
    try {
      req.usuario = verificarBoleto(boleto, { tipo, id: req.params[param], accion });
      return next();
    } catch (err) {
      if (err instanceof ErrorBoleto) return responder401(res, err.message, err.codigo);
      return next(err);
    }
  };
}

module.exports = { verificarToken, verificarTokenSesion, autenticarArchivo };
