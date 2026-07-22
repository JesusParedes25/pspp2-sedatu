/**
 * ARCHIVO: admin.routes.js
 * PROPÓSITO: Rutas de administración (solo superadmin).
 */
const { Router } = require('express');
const multer = require('multer');
const { requiereRol } = require('../middleware/roles.middleware');
const adminController = require('../controllers/admin.controller');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Ruta pública — config EmailJS para el frontend
router.get('/config/publico', adminController.obtenerConfigPublico);

// Solo superadmin puede acceder al resto
router.use(requiereRol(['superadmin']));

// Catálogos
router.get('/catalogos', adminController.listarCatalogos);
router.post('/catalogos', adminController.agregarValorCatalogo);
router.put('/catalogos/:id', adminController.editarValorCatalogo);
router.delete('/catalogos/:id', adminController.desactivarValorCatalogo);
router.patch('/catalogos/:id/reactivar', adminController.reactivarValorCatalogo);

// Geografía
router.get('/geo/zonas-metropolitanas', adminController.obtenerZonasMetropolitanas);
router.post('/geo/reemplazar/:capa', upload.single('archivo'), adminController.reemplazarShapefile);

// Usuarios
router.get('/usuarios', adminController.listarUsuarios);
router.post('/usuarios', adminController.crearUsuario);
router.put('/usuarios/:id', adminController.editarUsuario);
router.patch('/usuarios/:id/toggle', adminController.toggleUsuario);
router.delete('/usuarios/:id', adminController.eliminarUsuario);
router.post('/usuarios/:id/reenviar-invitacion', adminController.reenviarInvitacion);

// Áreas
router.get('/areas/dgs', adminController.listarDGs);
router.post('/areas/dgs', adminController.crearDG);
router.put('/areas/dgs/:id', adminController.editarDG);
router.get('/areas/das', adminController.listarDAs);
router.post('/areas/das', adminController.crearDA);
router.put('/areas/das/:id', adminController.editarDA);

// Configuración del sistema
router.get('/config', adminController.obtenerConfig);
router.put('/config', adminController.actualizarConfig);

module.exports = router;
