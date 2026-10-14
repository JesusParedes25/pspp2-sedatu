/**
 * ARCHIVO: plantillas.routes.js
 * PROPÓSITO: Rutas CRUD de plantillas de importación.
 */
const { Router } = require('express');
const ctrl = require('../controllers/plantillas.controller');
const { exigirSoloInternos } = require('../utils/alcance-lectura');

const router = Router();

router.get('/', ctrl.listar);
// Las plantillas no pertenecen a ningún proyecto (son por Dirección
// General), así que no hay un id_proyecto que resolver aquí — solo se
// cierra el caso 'externo', que no tiene ninguna razón para leer una
// plantilla de importación (ver exigirSoloInternos, alcance-lectura.js).
router.get('/:id', exigirSoloInternos(), ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);
router.get('/:id/descargar', ctrl.descargar);

module.exports = router;
