/**
 * ARCHIVO: tareas.routes.js
 * PROPÓSITO: Rutas CRUD de tareas (independientes por ID).
 */
const { Router } = require('express');
const tareasController = require('../controllers/tareas.controller');
const { exigirEdicionNodo } = require('../middleware/permisos.middleware');

const router = Router();

router.put('/:id', exigirEdicionNodo('tarea'), tareasController.actualizar);
router.patch('/:id', exigirEdicionNodo('tarea'), tareasController.patchAvanceSemaforo);
router.delete('/:id', tareasController.eliminar);   // verifica adentro (puedeGestionarNodo)

module.exports = router;
