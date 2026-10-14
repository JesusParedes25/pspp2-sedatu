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
 *
 * Un bloqueo expone detalle interno de un nodo (motivo, quién lo creó),
 * así que las tres rutas exigen captura-or-superior en la entidad
 * dueña (o, para resolver, haberlo creado) — ver exigirEdicionDeEntidadEnQuery
 * y exigirResolverBloqueo en permisos.middleware.js.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const ctrl = require('../controllers/bloqueos.controller');
const { exigirEdicionDeEntidadEnQuery, exigirResolverBloqueo } = require('../middleware/permisos.middleware');

const router = Router();

router.get('/',       exigirEdicionDeEntidadEnQuery(), ctrl.listarHistorial);
router.get('/activo', exigirEdicionDeEntidadEnQuery(), ctrl.obtenerActivo);
router.put('/:id/resolver', exigirResolverBloqueo(), ctrl.resolverBloqueo);

module.exports = router;
