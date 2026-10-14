/**
 * ARCHIVO: actividad.routes.js
 * PROPÓSITO: Rutas del stream de actividad unificado.
 * IMPORTANTE: /:id/descargar debe registrarse ANTES de /:tipo_nodo/:id_nodo
 * — ambas son patrones de 2 segmentos y Express matchea por orden; si el
 * genérico fuera primero, "descargar" se leería como id_nodo.
 *
 * POST / exige el mismo criterio "leer abierto, escribir cerrado" que ya
 * usa comentarios.routes.js — exigirEdicionDeNodoEnCuerpo() va DESPUÉS de
 * upload.single/corregirCodificacionArchivo a propósito: tipo_nodo/id_nodo
 * viven en el body multipart, que solo existe una vez que multer lo parseó.
 */
const { Router } = require('express');
const multer = require('multer');
const actividadController = require('../controllers/actividad.controller');
const corregirCodificacionArchivo = require('../middleware/corregirCodificacionArchivo.middleware');
const { exigirEdicionDeNodoEnCuerpo } = require('../middleware/permisos.middleware');
const { exigirVisibilidadActividadPorId, exigirVisibilidadNodoEnParams } = require('../utils/alcance-lectura');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

// Leer (listado y descarga) exige solo visibilidad del proyecto dueño —
// total entre internos, cerrado para 'externo' fuera de lo invitado.
// Escribir sigue exigiendo captura (exigirEdicionDeNodoEnCuerpo, sin
// cambios desde Fase 2 / Paso 0).
router.get('/:id/descargar', exigirVisibilidadActividadPorId(), actividadController.descargar);
router.post('/', upload.single('archivo'), corregirCodificacionArchivo, exigirEdicionDeNodoEnCuerpo(), actividadController.crear);
router.get('/:tipo_nodo/:id_nodo', exigirVisibilidadNodoEnParams(), actividadController.obtenerPorNodo);

module.exports = router;
