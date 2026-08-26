/**
 * ARCHIVO: notificaciones.routes.js
 * PROPÓSITO: Rutas de notificaciones del usuario autenticado.
 *
 * MINI-CLASE: Rutas de notificaciones
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son personales: cada usuario solo ve las suyas.
 * GET /notificaciones devuelve las últimas 50 del usuario autenticado.
 * PUT /notificaciones/:id/leer marca una como leída.
 * PUT /notificaciones/leer-todas marca todas como leídas de un golpe.
 * El orden importa: "leer-todas" debe ir ANTES de "/:id/leer" para
 * que Express no interprete "leer-todas" como un :id.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const notificacionesController = require('../controllers/notificaciones.controller');

const router = Router();

// IMPORTANTE: "resumen" y "stream" antes de "/:id/leer" por la misma razón
// que "leer-todas" — si no, Express intentaría leerlos como un :id.
router.get('/resumen', notificacionesController.resumen);
router.get('/stream', notificacionesController.stream);
router.get('/', notificacionesController.listar);
// IMPORTANTE: "leer-todas" antes de "/:id/leer" para evitar conflicto de rutas
router.put('/leer-todas', notificacionesController.marcarTodasLeidas);
router.put('/:id/leer', notificacionesController.marcarLeida);

module.exports = router;
