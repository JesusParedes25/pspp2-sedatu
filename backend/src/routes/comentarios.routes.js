/**
 * ARCHIVO: comentarios.routes.js
 * PROPÓSITO: Rutas de comentarios (inmutables — solo GET y POST).
 *
 * MINI-CLASE: Endpoints inmutables
 * ─────────────────────────────────────────────────────────────────
 * A diferencia de otros recursos, los comentarios NO tienen PUT ni
 * DELETE. Son registros inmutables por diseño institucional. Las
 * rutas disponibles son: GET (listar por entidad), POST (crear),
 * y POST /:id/responder (crear respuesta vinculada a un padre).
 * Esto simplifica la lógica y garantiza la integridad del historial.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const comentariosController = require('../controllers/comentarios.controller');

const { exigirEdicionDeEntidadEnCuerpo, exigirEdicionComentario } = require('../middleware/permisos.middleware');

const router = Router();

router.get('/', comentariosController.listar);
// Leer comentarios es para todos; escribirlos, solo para quien participa.
router.post('/', exigirEdicionDeEntidadEnCuerpo(), comentariosController.crear);
router.post('/:id/responder', exigirEdicionComentario(), comentariosController.responder);

module.exports = router;
