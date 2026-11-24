/**
 * ARCHIVO: comentarios.routes.js
 * PROPÓSITO: Rutas de comentarios (inmutables — solo GET y POST).
 *
 * NOTA TÉCNICA: Endpoints inmutables
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
const { exigirParticipacionDeEntidadEnQuery } = require('../utils/alcance-lectura');

const router = Router();

// Leer comentarios es contenido de trabajo, no seguimiento (paso 14
// DGTIC): exige participación real (funcionEfectivaEnProyecto/EnNodo),
// no solo visibilidad total entre internos. Escribir sigue exigiendo
// captura, sin cambios.
router.get('/', exigirParticipacionDeEntidadEnQuery(), comentariosController.listar);
router.post('/', exigirEdicionDeEntidadEnCuerpo(), comentariosController.crear);
router.post('/:id/responder', exigirEdicionComentario(), comentariosController.responder);

module.exports = router;
