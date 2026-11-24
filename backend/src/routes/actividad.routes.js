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
const { exigirParticipacionActividadPorId, exigirVisibilidadNodoEnParams } = require('../utils/alcance-lectura');
const { upload } = require('../middleware/subidaArchivo.middleware');

const router = Router();

// El boleto de descarga es contenido de trabajo (paso 14 DGTIC): exige
// participación real, no solo visibilidad del proyecto dueño.
// El listado (GET /:tipo_nodo/:id_nodo) mezcla cambios de avance/estado
// (seguimiento, debe seguir abierto) con comentarios/archivos/riesgos
// (contenido de trabajo) bajo el mismo stream — no se puede bloquear
// entero sin ocultar también lo que debe seguir visible, así que se
// queda en visibilidad y el controller redacta el contenido de trabajo
// cuando falta participación (ver actividad.controller.js).
// Escribir sigue exigiendo captura (exigirEdicionDeNodoEnCuerpo, sin
// cambios desde Fase 2 / Paso 0).
router.post('/:id/boleto', exigirParticipacionActividadPorId(), boletosController.emitirBoletoActividad);
router.post('/', upload.single('archivo'), corregirCodificacionArchivo, exigirEdicionDeNodoEnCuerpo(), actividadController.crear);
router.get('/:tipo_nodo/:id_nodo', exigirVisibilidadNodoEnParams(), actividadController.obtenerPorNodo);

module.exports = router;
