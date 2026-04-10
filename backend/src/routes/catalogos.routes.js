/**
 * ARCHIVO: catalogos.routes.js
 * PROPÓSITO: Rutas de catálogos del sistema (solo lectura).
 *
 * MINI-CLASE: Endpoints de catálogos
 * ─────────────────────────────────────────────────────────────────
 * Todos los endpoints de catálogos son GET de solo lectura. El
 * frontend los consume al cargar la aplicación para poblar selects,
 * filtros y autocompletados. Los catálogos de SEDATU son pequeños
 * (19 DGs, ~50 usuarios, ~5 programas) así que se devuelven
 * completos sin paginación.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const catalogosController = require('../controllers/catalogos.controller');

const router = Router();

router.get('/dgs', catalogosController.obtenerDGs);
router.get('/usuarios', catalogosController.obtenerUsuarios);
router.get('/programas', catalogosController.obtenerProgramas);
router.get('/direcciones-area', catalogosController.obtenerDireccionesArea);

module.exports = router;
