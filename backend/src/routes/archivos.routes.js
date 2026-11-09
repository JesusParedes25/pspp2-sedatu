/**
 * ARCHIVO: archivos.routes.js
 * PROPÓSITO: Endpoints que TRANSMITEN un archivo al navegador.
 *
 * Se montan en routes/index.js ANTES de verificarToken, porque además de
 * la cabecera Authorization aceptan un boleto efímero en la URL (lo que
 * necesitan <a href>, <iframe>, <img>, que no pueden mandar cabeceras).
 * autenticarArchivo() acepta exactamente esas dos vías y nada más; luego
 * corre el mismo middleware de visibilidad de siempre, ANTES de abrir
 * cualquier flujo hacia el almacén.
 *
 *   GET /evidencias/:id/ver        inline      (vista previa)
 *   GET /evidencias/:id/descargar  attachment
 *   GET /actividad/:id/ver         inline      (adjuntos de tareas)
 *   GET /actividad/:id/descargar   attachment
 *
 * Los boletos se piden con POST /evidencias/:id/boleto y
 * POST /actividad/:id/boleto (esas sí, detrás de verificarToken).
 */
const { Router } = require('express');
const { autenticarArchivo } = require('../middleware/auth.middleware');
const { exigirVisibilidadEvidencia, exigirVisibilidadActividadPorId } = require('../utils/alcance-lectura');
const evidenciasController = require('../controllers/evidencias.controller');
const actividadController = require('../controllers/actividad.controller');

const router = Router();

router.get('/evidencias/:id/ver', autenticarArchivo('evidencia', 'ver'), exigirVisibilidadEvidencia(), evidenciasController.ver);
router.get('/evidencias/:id/descargar', autenticarArchivo('evidencia', 'descargar'), exigirVisibilidadEvidencia(), evidenciasController.descargar);
router.get('/actividad/:id/ver', autenticarArchivo('actividad', 'ver'), exigirVisibilidadActividadPorId(), actividadController.ver);
router.get('/actividad/:id/descargar', autenticarArchivo('actividad', 'descargar'), exigirVisibilidadActividadPorId(), actividadController.descargar);

module.exports = router;
