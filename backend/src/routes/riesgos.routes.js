/**
 * ARCHIVO: riesgos.routes.js
 * PROPÓSITO: Rutas CRUD de riesgos (independientes por ID).
 *
 * MINI-CLASE: Riesgos como recurso independiente
 * ─────────────────────────────────────────────────────────────────
 * Aunque los riesgos se listan por proyecto (GET /proyectos/:id/riesgos
 * montado en routes/index.js), las operaciones individuales (GET, PUT,
 * DELETE) son independientes. POST /riesgos también es independiente
 * porque el body contiene entidad_tipo + entidad_id que indica a
 * qué nivel pertenece el riesgo (Proyecto, Etapa, Acción, etc.).
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const riesgosController = require('../controllers/riesgos.controller');

const router = Router();

router.post('/', riesgosController.crear);
router.get('/:id', riesgosController.obtenerPorId);
router.put('/:id', riesgosController.actualizar);
router.delete('/:id', riesgosController.eliminar);

module.exports = router;
