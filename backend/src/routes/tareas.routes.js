/**
 * ARCHIVO: tareas.routes.js
 * PROPÓSITO: Rutas CRUD de tareas (independientes por ID).
 */
const { Router } = require('express');
const tareasController = require('../controllers/tareas.controller');

const router = Router();

router.put('/:id', tareasController.actualizar);
router.patch('/:id', tareasController.patchAvanceSemaforo);
router.delete('/:id', tareasController.eliminar);

module.exports = router;
