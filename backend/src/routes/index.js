/**
 * ARCHIVO: routes/index.js
 * PROPÓSITO: Enrutador principal que monta todas las rutas de la API bajo /api/v1.
 *
 * MINI-CLASE: Montaje de rutas en Express
 * ─────────────────────────────────────────────────────────────────
 * Express permite montar routers hijos con router.use(prefijo, hijo).
 * Esto crea una jerarquía de rutas: /api/v1/proyectos monta el
 * router de proyectos, /api/v1/auth monta el de autenticación, etc.
 * Las rutas anidadas (como /proyectos/:id/etapas) se montan aquí
 * directamente porque conectan controllers de diferentes recursos.
 * verificarToken se aplica a TODAS las rutas excepto /auth/login.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const multer = require('multer');
const { verificarToken } = require('../middleware/auth.middleware');

// Multer en memoria para archivos (max 200MB para shapefiles grandes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

// Importar routers de cada recurso
const authRoutes = require('./auth.routes');
const proyectosRoutes = require('./proyectos.routes');
const etapasRoutes = require('./etapas.routes');
const accionesRoutes = require('./acciones.routes');
const evidenciasRoutes = require('./evidencias.routes');
const comentariosRoutes = require('./comentarios.routes');
const riesgosRoutes = require('./riesgos.routes');
const notificacionesRoutes = require('./notificaciones.routes');
const catalogosRoutes = require('./catalogos.routes');
const bloqueosRoutes = require('./bloqueos.routes');
const importarRoutes = require('./importar.routes');
const plantillasRoutes = require('./plantillas.routes');

// Importar controllers para rutas anidadas
const etapasController = require('../controllers/etapas.controller');
const accionesController = require('../controllers/acciones.controller');
const evidenciasController = require('../controllers/evidencias.controller');
const riesgosController = require('../controllers/riesgos.controller');
const indicadoresController = require('../controllers/indicadores.controller');
const proyectosStatsController = require('../controllers/proyectos.stats.controller');
const bloqueosController = require('../controllers/bloqueos.controller');
const estadoController = require('../controllers/estado.controller');

const router = Router();

// ─── Rutas públicas ────────────────────────────────────────────
router.use('/auth', authRoutes);

// Imagen de encabezado (pública porque <img src> no envía JWT)
const proyectosController = require('../controllers/proyectos.controller');
router.get('/proyectos/:id/imagen', proyectosController.servirImagen);

// ─── Middleware de autenticación para todas las rutas siguientes ─
router.use(verificarToken);

// ─── Recursos principales ──────────────────────────────────────
router.use('/proyectos', proyectosRoutes);
router.use('/etapas', etapasRoutes);
router.use('/acciones', accionesRoutes);
router.use('/evidencias', evidenciasRoutes);
router.use('/comentarios', comentariosRoutes);
router.use('/riesgos', riesgosRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/catalogos', catalogosRoutes);
router.use('/bloqueos', bloqueosRoutes);
router.use('/importar', importarRoutes);
router.use('/plantillas-importacion', plantillasRoutes);

// ─── Rutas anidadas (conectan controllers de diferentes recursos) ─

// Etapas de un proyecto
router.get('/proyectos/:id/etapas', etapasController.listarPorProyecto);
router.post('/proyectos/:id/etapas', etapasController.crear);

// Acciones de una etapa
router.get('/etapas/:id/acciones', accionesController.listarPorEtapa);
router.post('/etapas/:id/acciones', accionesController.crearEnEtapa);

// Acciones directas del proyecto (sin etapa)
router.get('/proyectos/:id/acciones', accionesController.listarDirectasProyecto);
router.post('/proyectos/:id/acciones', accionesController.crearEnProyecto);

// Subacciones de una acción
router.get('/acciones/:id/subacciones', accionesController.listarSubacciones);
router.post('/acciones/:id/subacciones', accionesController.crearSubaccion);
// toggle eliminado — usar PUT /acciones/:id con { estado } en body

// Indicadores vinculados a una acción (lectura + edición)
router.get('/acciones/:id/indicadores', accionesController.obtenerIndicadores);
router.put('/acciones/:id/indicadores', accionesController.actualizarIndicadores);

// Importar estructura desde CSV
router.post('/proyectos/:id/importar-csv', accionesController.importarCSV);

// Evidencias de acciones, riesgos y subacciones
router.get('/acciones/:id/evidencias', evidenciasController.listarPorAccion);
router.post('/acciones/:id/evidencias', upload.single('archivo'), evidenciasController.subirParaAccion);
router.get('/riesgos/:id/evidencias', evidenciasController.listarPorRiesgo);
router.post('/riesgos/:id/evidencias', upload.single('archivo'), evidenciasController.subirParaRiesgo);
router.get('/subacciones/:id/evidencias', evidenciasController.listarPorSubaccion);
router.post('/subacciones/:id/evidencias', upload.single('archivo'), evidenciasController.subirParaSubaccion);
router.get('/proyectos/:id/evidencias', evidenciasController.listarPorProyecto);

// Riesgos de un proyecto, etapa, acción y subacción
router.get('/proyectos/:id/riesgos', riesgosController.listarPorProyecto);
router.get('/etapas/:id/riesgos', riesgosController.listarPorEtapa);
router.get('/acciones/:id/riesgos', riesgosController.listarPorAccion);
router.get('/subacciones/:id/riesgos', riesgosController.listarPorSubaccion);

// Indicadores de un proyecto (nivel proyecto, nivel etapa, o todos)
router.get('/proyectos/:id/indicadores', indicadoresController.listarPorProyecto);
router.get('/proyectos/:id/indicadores/todos', indicadoresController.listarTodosPorProyecto);
router.post('/proyectos/:id/indicadores', indicadoresController.crear);
router.get('/etapas/:id/indicadores', indicadoresController.listarPorEtapa);
router.put('/indicadores/:id', indicadoresController.actualizar);
router.delete('/indicadores/:id', indicadoresController.eliminar);
router.get('/indicadores/:id/resumen-aportaciones', indicadoresController.resumenAportaciones);

// Estadísticas del proyecto (para el resumen/dashboard)
router.get('/proyectos/:id/stats', proyectosStatsController.obtenerStats);

// Conteo de descendientes (para confirm de cancelación en cascada)
router.get('/conteo-descendientes', estadoController.conteoDescendientes);

// Cambio de estado genérico (alternativa a PUT en cada recurso)
router.put('/estado', estadoController.cambiarEstado);

// Agenda del usuario autenticado
router.get('/agenda', accionesController.agenda);

module.exports = router;
