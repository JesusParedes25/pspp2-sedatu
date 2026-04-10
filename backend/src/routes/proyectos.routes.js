/**
 * ARCHIVO: proyectos.routes.js
 * PROPÓSITO: Rutas CRUD de proyectos y gestión de DGs participantes.
 *
 * MINI-CLASE: RESTful routes y convenciones de nombres
 * ─────────────────────────────────────────────────────────────────
 * Cada recurso tiene rutas estándar: GET (listar/obtener), POST
 * (crear), PUT (actualizar), DELETE (eliminar). Las rutas anidadas
 * como /proyectos/:id/dgs representan la relación "DGs de un
 * proyecto". El middleware verificarToken se aplica a TODAS las
 * rutas de este archivo porque están montadas después del
 * middleware global de auth en routes/index.js.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const proyectosController = require('../controllers/proyectos.controller');

const router = Router();

router.get('/', proyectosController.listar);
router.post('/', proyectosController.crear);
router.get('/:id', proyectosController.obtenerPorId);
router.put('/:id', proyectosController.actualizar);
router.delete('/:id', proyectosController.eliminar);

// DGs participantes
router.get('/:id/dgs', proyectosController.obtenerDGs);
router.post('/:id/dgs', proyectosController.agregarDG);
router.delete('/:id/dgs/:dg_id', proyectosController.eliminarDG);

module.exports = router;
