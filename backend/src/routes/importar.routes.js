/**
 * ARCHIVO: importar.routes.js
 * PROPÓSITO: Rutas del importador universal.
 */
const { Router } = require('express');
const multer = require('multer');
const ctrl = require('../controllers/importar.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();

router.post('/upload', upload.single('archivo'), ctrl.upload);
router.post('/extraer-headers', ctrl.extraerHeaders);
router.post('/preview', ctrl.preview);
router.post('/confirmar', ctrl.confirmar);
router.post('/sugerir', ctrl.sugerir);

module.exports = router;
