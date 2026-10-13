/**
 * ARCHIVO: tareas.routes.js
 * PROPÓSITO: Rutas CRUD de tareas (independientes por ID).
 */
const { Router } = require('express');
const tareasController = require('../controllers/tareas.controller');
const { exigirEdicionNodo } = require('../middleware/permisos.middleware');

const router = Router();

router.put('/:id', exigirEdicionNodo('tarea'), tareasController.actualizar);
// Sin exigirEdicionNodo aquí a propósito: ver el comentario equivalente
// en etapas.routes.js — el controller decide el mínimo por los campos
// del payload (minimoParaPatchNodo en utils/autorizacion.js).
router.patch('/:id', tareasController.patchAvanceSemaforo);
router.patch('/:id/campo', exigirEdicionNodo('tarea'), tareasController.patchCampo);
router.delete('/:id', tareasController.eliminar);   // verifica adentro (puedeGestionarNodo)

module.exports = router;
