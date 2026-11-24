/**
 * ARCHIVO: auth.routes.js
 * PROPÓSITO: Rutas de autenticación (login y obtener usuario actual).
 *
 * NOTA TÉCNICA: Rutas públicas vs protegidas
 * ─────────────────────────────────────────────────────────────────
 * POST /auth/login es la ÚNICA ruta pública de toda la API. No
 * requiere token porque es donde el usuario obtiene su token.
 * GET /auth/me requiere verificarToken porque devuelve datos
 * del usuario autenticado — necesita saber quién es.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const { verificarToken } = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');
const {
  limiteLoginPorIp, limiteLoginPorCorreo,
  limiteRecuperacionPorIp, limiteRecuperacionPorCorreo,
} = require('../middleware/rateLimit.middleware');

const router = Router();

// Ruta pública — no requiere token. Límite estricto, por IP y por correo
// (ver middleware/rateLimit.middleware.js): son los dos endpoints
// alcanzables sin sesión, y solicitar-recuperacion dispara un envío real
// por SMTP en cada intento (utils/correo.js).
router.post('/login', limiteLoginPorIp, limiteLoginPorCorreo, authController.login);
router.post('/activar-cuenta', authController.activarCuenta);
router.post('/solicitar-recuperacion', limiteRecuperacionPorIp, limiteRecuperacionPorCorreo, authController.solicitarRecuperacion);
router.get('/validar-token-recuperacion', authController.validarTokenRecuperacion);
router.post('/restablecer-contrasena', authController.restablecerContrasena);

// Ruta protegida — requiere token válido
router.get('/me', verificarToken, authController.obtenerUsuarioActual);
router.post('/renovar', verificarToken, authController.renovarToken);

module.exports = router;
