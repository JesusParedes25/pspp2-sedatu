/**
 * ARCHIVO: actividad.routes.js
 * PROPÓSITO: Rutas del stream de actividad unificado.
 * IMPORTANTE: /:id/ver y /:id/descargar deben registrarse ANTES de
 * /:tipo_nodo/:id_nodo: son patrones de 2 segmentos y Express matchea
 * por orden; si el genérico fuera primero, "ver"/"descargar" se leerían
 * como id_nodo.
 *
 * POST / exige el mismo criterio "leer abierto, escribir cerrado" que ya
 * usa comentarios.routes.js — exigirEdicionDeNodoEnCuerpo() va DESPUÉS de
 * upload.single/corregirCodificacionArchivo a propósito: tipo_nodo/id_nodo
 * viven en el body multipart, que solo existe una vez que multer lo parseó.
 */
const { Router } = require('express');
const actividadController = require('../controllers/actividad.controller');
const corregirCodificacionArchivo = require('../middleware/corregirCodificacionArchivo.middleware');
const { exigirEdicionDeNodoEnCuerpo } = require('../middleware/permisos.middleware');
const { exigirVisibilidadActividadPorId, exigirVisibilidadNodoEnParams } = require('../utils/alcance-lectura');
const { upload } = require('../middleware/subidaArchivo.middleware');

const router = Router();

// Leer (listado y descarga) exige solo visibilidad del proyecto dueño —
// total entre internos, cerrado para 'externo' fuera de lo invitado.
// Escribir sigue exigiendo captura (exigirEdicionDeNodoEnCuerpo, sin
// cambios desde Fase 2 / Paso 0).
router.get('/:id/ver', exigirVisibilidadActividadPorId(), actividadController.ver);
router.get('/:id/descargar', exigirVisibilidadActividadPorId(), actividadController.descargar);
router.post('/', upload.single('archivo'), corregirCodificacionArchivo, exigirEdicionDeNodoEnCuerpo(), actividadController.crear);
router.get('/:tipo_nodo/:id_nodo', exigirVisibilidadNodoEnParams(), actividadController.obtenerPorNodo);

module.exports = router;
