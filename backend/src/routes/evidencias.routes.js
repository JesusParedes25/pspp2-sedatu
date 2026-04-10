/**
 * ARCHIVO: evidencias.routes.js
 * PROPÓSITO: Rutas de evidencias (descarga y eliminación por ID).
 *
 * MINI-CLASE: Rutas de archivos y streaming
 * ─────────────────────────────────────────────────────────────────
 * Las rutas de subida están anidadas bajo acciones y riesgos (en
 * routes/index.js) porque necesitan el ID del padre. Las rutas de
 * descarga y eliminación son independientes porque solo necesitan
 * el ID de la evidencia. GET /evidencias/:id/descargar hace stream
 * directo desde MinIO sin cargar el archivo completo en memoria.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const evidenciasController = require('../controllers/evidencias.controller');

const router = Router();

router.get('/', evidenciasController.listarTodas);
router.get('/:id/descargar', evidenciasController.descargar);
router.delete('/:id', evidenciasController.eliminar);

module.exports = router;
