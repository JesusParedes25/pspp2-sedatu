/**
 * ARCHIVO: acciones.routes.js
 * PROPÓSITO: Rutas CRUD de acciones e independientes.
 *
 * MINI-CLASE: Acciones como nivel atómico de seguimiento
 * ─────────────────────────────────────────────────────────────────
 * Las acciones son el nivel más granular del seguimiento. Solo aquí
 * se edita el porcentaje manualmente. Las rutas de creación están
 * anidadas bajo etapas o proyectos (en el routes/index.js), y las
 * de lectura/actualización/eliminación son independientes por ID.
 * PUT /acciones/:id es el endpoint más crítico porque dispara el
 * recálculo en cascada etapa → proyecto.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const accionesController = require('../controllers/acciones.controller');
const { exigirEdicionNodo } = require('../middleware/permisos.middleware');

const router = Router();

router.get('/:id', accionesController.obtenerPorId);
router.put('/:id', exigirEdicionNodo('accion'), accionesController.actualizar);
// Sin exigirEdicionNodo aquí a propósito: ver el comentario equivalente
// en etapas.routes.js — el controller decide el mínimo por los campos
// del payload (minimoParaPatchNodo en utils/autorizacion.js).
router.patch('/:id', accionesController.patchAvanceSemaforo);
router.patch('/:id/campo', exigirEdicionNodo('accion'), accionesController.patchCampo);
router.delete('/:id', accionesController.eliminar);   // verifica adentro (puedeGestionarNodo)

module.exports = router;
