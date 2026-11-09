/**
 * ARCHIVO: evidencias.routes.js
 * PROPÓSITO: Rutas de evidencias (descarga y eliminación por ID).
 *
 * NOTA TÉCNICA: Rutas de archivos y streaming
 * ─────────────────────────────────────────────────────────────────
 * Las rutas de subida están anidadas bajo acciones y riesgos (en
 * routes/index.js) porque necesitan el ID del padre. Las rutas de
 * descarga y eliminación son independientes porque solo necesitan
 * el ID de la evidencia. GET /evidencias/:id/ver (inline, para vista
 * previa) y GET /evidencias/:id/descargar (attachment) transmiten el
 * objeto por flujo desde el backend (utils/transmitirObjeto.js): el
 * almacén no se publica y el navegador nunca habla con él. Las dos pasan
 * por exigirVisibilidadEvidencia() ANTES de abrir el flujo.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const evidenciasController = require('../controllers/evidencias.controller');

const { exigirEdicionEvidencia } = require('../middleware/permisos.middleware');
const { exigirVisibilidadEvidencia } = require('../utils/alcance-lectura');

const router = Router();

// listarTodas ya filtra por alcanceProyectosUsuarioONull (vista
// personalizada, acotada a participación — fuera de este PR, ver
// docs/modelo-permisos.md). La descarga por UUID no filtraba nada: solo
// se cierra el caso 'externo' fuera de su proyecto invitado.
router.get('/', evidenciasController.listarTodas);
router.get('/:id/ver', exigirVisibilidadEvidencia(), evidenciasController.ver);
router.get('/:id/descargar', exigirVisibilidadEvidencia(), evidenciasController.descargar);
router.delete('/:id', exigirEdicionEvidencia(), evidenciasController.eliminar);

module.exports = router;
