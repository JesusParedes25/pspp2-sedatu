/**
 * ARCHIVO: bloqueos.routes.js
 * PROPÓSITO: Rutas REST para bloqueos.
 *
 * MINI-CLASE: Rutas de consulta y resolución
 * ─────────────────────────────────────────────────────────────────
 * GET /bloqueos          → historial por entidad (query params)
 * GET /bloqueos/activo   → bloqueo activo de una entidad
 * PUT /bloqueos/:id/resolver → cerrar bloqueo con nota de resolución
 * La creación de bloqueos se maneja internamente en cambiarEstado().
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const ctrl = require('../controllers/bloqueos.controller');

const router = Router();

router.get('/',       ctrl.listarHistorial);
router.get('/activo', ctrl.obtenerActivo);
router.put('/:id/resolver', ctrl.resolverBloqueo);

module.exports = router;
