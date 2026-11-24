/**
 * ARCHIVO: evidencias.routes.js
 * PROPÓSITO: Rutas de evidencias (descarga y eliminación por ID).
 *
 * NOTA TÉCNICA: Rutas de archivos y streaming
 * ─────────────────────────────────────────────────────────────────
 * Las rutas de subida están anidadas bajo acciones y riesgos (en
 * routes/index.js) porque necesitan el ID del padre. Las rutas de
 * descarga y eliminación son independientes porque solo necesitan
 * el ID de la evidencia. La transmisión (GET /evidencias/:id/ver y
 * /descargar) vive en routes/archivos.routes.js, montada antes de
 * verificarToken porque acepta un boleto efímero en la URL; aquí queda el
 * POST /evidencias/:id/boleto que lo emite, con la cabecera normal.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const evidenciasController = require('../controllers/evidencias.controller');
const boletosController = require('../controllers/boletos.controller');

const { exigirEdicionEvidencia } = require('../middleware/permisos.middleware');
const { exigirParticipacionEvidencia } = require('../utils/alcance-lectura');

const router = Router();

// listarTodas ya filtra por alcanceProyectosUsuarioONull (vista
// personalizada, acotada a participación — fuera de este PR, ver
// docs/modelo-permisos.md). El boleto de descarga por UUID es contenido
// de trabajo (paso 14 DGTIC): exige participación real.
router.get('/', evidenciasController.listarTodas);
router.post('/:id/boleto', exigirParticipacionEvidencia(), boletosController.emitirBoletoEvidencia);
router.delete('/:id', exigirEdicionEvidencia(), evidenciasController.eliminar);

module.exports = router;
