/**
 * ARCHIVO: actividad.routes.js
 * PROPÓSITO: Rutas del stream de actividad unificado.
 * La transmisión de adjuntos (GET /actividad/:id/ver y /descargar) vive en
 * routes/archivos.routes.js, montada en routes/index.js antes de este
 * router y antes de verificarToken (acepta boleto efímero en la URL), así
 * que "ver"/"descargar" nunca llegan a leerse como id_nodo del patrón
 * genérico /:tipo_nodo/:id_nodo de aquí abajo.
 *
 * POST / exige el mismo criterio "leer abierto, escribir cerrado" que ya
 * usa comentarios.routes.js — exigirEdicionDeNodoEnCuerpo() va DESPUÉS de
 * upload.single/corregirCodificacionArchivo a propósito: tipo_nodo/id_nodo
 * viven en el body multipart, que solo existe una vez que multer lo parseó.
 */
const { Router } = require('express');
const actividadController = require('../controllers/actividad.controller');
const boletosController = require('../controllers/boletos.controller');
const corregirCodificacionArchivo = require('../middleware/corregirCodificacionArchivo.middleware');
const { exigirEdicionDeNodoEnCuerpo } = require('../middleware/permisos.middleware');
const { exigirVisibilidadActividadPorId, exigirVisibilidadNodoEnParams } = require('../utils/alcance-lectura');
const { upload } = require('../middleware/subidaArchivo.middleware');

const router = Router();

// Leer (listado y emisión de boletos de descarga) exige solo visibilidad
// del proyecto dueño: total entre internos, cerrado para 'externo' fuera
// de lo invitado.
// Escribir sigue exigiendo captura (exigirEdicionDeNodoEnCuerpo, sin
// cambios desde Fase 2 / Paso 0).
router.post('/:id/boleto', exigirVisibilidadActividadPorId(), boletosController.emitirBoletoActividad);
router.post('/', upload.single('archivo'), corregirCodificacionArchivo, exigirEdicionDeNodoEnCuerpo(), actividadController.crear);
router.get('/:tipo_nodo/:id_nodo', exigirVisibilidadNodoEnParams(), actividadController.obtenerPorNodo);

module.exports = router;
