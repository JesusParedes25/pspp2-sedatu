/**
 * ARCHIVO: etapas.routes.js
 * PROPÓSITO: Rutas CRUD de etapas.
 *
 * MINI-CLASE: Rutas anidadas vs independientes
 * ─────────────────────────────────────────────────────────────────
 * Las etapas tienen dos tipos de rutas: anidadas bajo proyectos
 * (GET/POST /proyectos/:id/etapas) para listar y crear dentro de
 * un proyecto, e independientes (GET/PUT/DELETE /etapas/:id) para
 * operar sobre una etapa específica. Las rutas anidadas se montan
 * en proyectos.routes.js referenciando este controller; las
 * independientes se montan aquí directamente.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const etapasController = require('../controllers/etapas.controller');
const indicadoresController = require('../controllers/indicadores.controller');

const router = Router();

router.get('/:id/indicadores', indicadoresController.listarPorEtapa);
router.get('/:id', etapasController.obtenerPorId);
router.put('/:id', etapasController.actualizar);
router.delete('/:id', etapasController.eliminar);

module.exports = router;
