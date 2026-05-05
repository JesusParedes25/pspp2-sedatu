/**
 * ARCHIVO: plantillas.routes.js
 * PROPÓSITO: Rutas CRUD de plantillas de importación.
 */
const { Router } = require('express');
const ctrl = require('../controllers/plantillas.controller');

const router = Router();

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);
router.get('/:id/descargar', ctrl.descargar);

module.exports = router;
