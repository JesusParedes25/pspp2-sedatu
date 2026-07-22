/**
 * ARCHIVO: actividad.routes.js
 * PROPÓSITO: Rutas del stream de actividad unificado.
 * IMPORTANTE: /:id/descargar debe registrarse ANTES de /:tipo_nodo/:id_nodo
 * — ambas son patrones de 2 segmentos y Express matchea por orden; si el
 * genérico fuera primero, "descargar" se leería como id_nodo.
 */
const { Router } = require('express');
const multer = require('multer');
const actividadController = require('../controllers/actividad.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

router.get('/:id/descargar', actividadController.descargar);
router.post('/', upload.single('archivo'), actividadController.crear);
router.get('/:tipo_nodo/:id_nodo', actividadController.obtenerPorNodo);

module.exports = router;
