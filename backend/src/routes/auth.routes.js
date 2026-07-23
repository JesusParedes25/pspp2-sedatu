/**
 * ARCHIVO: auth.routes.js
 * PROPÓSITO: Rutas de autenticación (login y obtener usuario actual).
 *
 * MINI-CLASE: Rutas públicas vs protegidas
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

const router = Router();

// Ruta pública — no requiere token
router.post('/login', authController.login);
router.post('/activar-cuenta', authController.activarCuenta);
router.post('/solicitar-recuperacion', authController.solicitarRecuperacion);
router.get('/validar-token-recuperacion', authController.validarTokenRecuperacion);
router.post('/restablecer-contrasena', authController.restablecerContrasena);
router.get('/config-correo', authController.obtenerConfigCorreoPublico);

// Ruta protegida — requiere token válido
router.get('/me', verificarToken, authController.obtenerUsuarioActual);

module.exports = router;
