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
const { exigirVisibilidadDeEntidadEnQuery } = require('../utils/alcance-lectura');

const router = Router();

// Leer es para cualquier interno (visibilidad total entre perfiles
// internos); solo se cierra para 'externo' fuera de sus proyectos
// invitados. Escribir sigue exigiendo captura, sin cambios.
router.get('/', exigirVisibilidadDeEntidadEnQuery(), comentariosController.listar);
router.post('/', exigirEdicionDeEntidadEnCuerpo(), comentariosController.crear);
router.post('/:id/responder', exigirEdicionComentario(), comentariosController.responder);

module.exports = router;
