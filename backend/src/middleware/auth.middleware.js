/**
 * ARCHIVO: auth.middleware.js
 * PROPÓSITO: Verificar que cada petición protegida traiga un JWT válido
 *            Y una sesión vigente (cuenta activa, no revocada).
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
 *
 * NOTA TÉCNICA: por qué el JWT ya no basta por sí solo
 * ─────────────────────────────────────────────────────────────────
 * Antes de esto, verificarToken SOLO comprobaba la firma y el `exp`
 * del token: req.usuario salía entero de los claims, sin volver a
 * tocar la base de datos. Eso significa dos huecos:
 *   1. Si un superadministrador desactiva una cuenta, la persona
 *      seguía entrando a la API con su token hasta que expirara solo
 *      (antes hasta 48h fijas). No había forma de revocar una sesión
 *      sin rotar JWT_SECRET, que cierra a todo el mundo.
 *   2. rol/id_dg/id_direccion_area quedaban congelados en el valor del
 *      momento del login: un cambio de rol o de adscripción mid-sesión
 *      no se reflejaba hasta el siguiente login.
 * Ahora cada petición autenticada hace un SELECT por PK (usuarios.id,
 * indexado) que: (a) exige activo = true, (b) exige que
 * usuarios.token_version coincida con el claim `tv` del token — lo que
 * permite revocar sin esperar a que el token expire (desactivar la
 * cuenta o cambiarle la contraseña suben token_version, ver
 * admin.controller.js::toggleUsuario y auth.controller.js), y (c)
 * devuelve rol/id_dg/id_direccion_area/nombre_completo frescos, no los
 * del login. El costo es una consulta SELECT por PK adicional por
 * petición — marginal frente al resto de los endpoints, que ya
 * consultan la base de datos.
 * ─────────────────────────────────────────────────────────────────
 */
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { verificarBoleto, ErrorBoleto } = require('../utils/boletoArchivo');

function responder401(res, mensaje, codigo) {
  return res.status(401).json({ error: true, mensaje, codigo });
}

class ErrorSesion extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Decodifica y valida la FIRMA del token (sincrónico). No consulta la BD
// todavía — eso lo hace cargarUsuarioSesion, que es async.
function decodificarTokenSesion(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Rechaza cualquier JWT que declare un propósito propio (claim `prp`,
  // p. ej. un boleto de archivo): un boleto no es una sesión aunque, por
  // un error de configuración, llegara a pasar la firma.
  if (decoded.prp !== undefined) {
    const err = new Error('Token con propósito distinto de sesión');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return decoded;
}

// Confirma que la sesión siga vigente del lado del servidor y devuelve
// los datos FRESCOS del usuario (no los del token). Lanza ErrorSesion si
// la cuenta ya no existe, está desactivada, o el token fue revocado
// (token_version ya no coincide — cuenta desactivada y reactivada,
// contraseña cambiada, etc.).
async function cargarUsuarioSesion(decoded) {
  const { rows } = await pool.query(
    `SELECT id, nombre_completo, correo, rol, id_dg, id_direccion_area, activo, token_version
     FROM usuarios WHERE id = $1`,
    [decoded.id]
  );
  const fila = rows[0];
  const tokenVersionEsperada = decoded.tv || 0;
  if (!fila || !fila.activo || (fila.token_version || 0) !== tokenVersionEsperada) {
    throw new ErrorSesion('AUTH_SESSION_REVOKED', 'La sesión ya no es válida, inicia sesión de nuevo');
  }
  return {
    usuario: {
      id: fila.id,
      correo: fila.correo,
      rol: fila.rol,
      id_dg: fila.id_dg,
      id_direccion_area: fila.id_direccion_area,
      nombre_completo: fila.nombre_completo,
    },
    // Metadatos de la sesión en sí (no del perfil): el endpoint de
    // renovación los necesita para medir el techo absoluto y reemitir el
    // token con la misma versión. Nunca se exponen en una respuesta JSON
    // tal cual (ver auth.controller.js::renovarToken).
    sesionMeta: { inicioSesion: decoded.ini, tokenVersion: fila.token_version },
  };
}

// Verifica un token de sesión de punta a punta (firma + vigencia en BD) y
// devuelve { usuario, sesionMeta }. Punto único que usan verificarToken y
// autenticarArchivo.
async function verificarTokenSesion(token) {
  const decoded = decodificarTokenSesion(token);
  return cargarUsuarioSesion(decoded);
}

function responderErrorSesion(res, err) {
  if (err instanceof ErrorSesion) {
    return responder401(res, err.message, err.codigo);
  }
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
async function verificarToken(req, res, next) {
  const token = tokenDeCabecera(req);
  if (!token) {
    return responder401(res, 'Token de autenticación no proporcionado', 'AUTH_TOKEN_MISSING');
  }

  try {
    const { usuario, sesionMeta } = await verificarTokenSesion(token);
    req.usuario = usuario;
    req.sesionMeta = sesionMeta;
    next();
  } catch (err) {
    // Token expirado, firma inválida, JWT que no es de sesión, o sesión
    // revocada del lado del servidor.
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
  return async function autenticarArchivoMiddleware(req, res, next) {
    const token = tokenDeCabecera(req);
    if (token) {
      try {
        const { usuario, sesionMeta } = await verificarTokenSesion(token);
        req.usuario = usuario;
        req.sesionMeta = sesionMeta;
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
