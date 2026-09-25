/**
 * ARCHIVO: catalogo-indicadores.routes.js
 * PROPÓSITO: Rutas del catálogo de indicadores.
 *
 * Lectura y alta abiertas a cualquier usuario autenticado (sin eso no
 * podría elegir indicadores al capturar su proyecto, ni agregar el que
 * le falte); edición, retiro y fusión reservadas a superadmin, que son
 * las operaciones que afectan proyectos ajenos.
 */
const { Router } = require('express');
const ctrl = require('../controllers/catalogo-indicadores.controller');
const { requiereRol } = require('../middleware/roles.middleware');

const router = Router();

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
// Rutas literales ANTES de '/:id' — si no, Express intentaría matchear
// "similares"/"fusionar" como si fueran un :id.
router.get('/similares', ctrl.buscarSimilares);
router.get('/productos', ctrl.listarProductos);
router.get('/lineas-accion', ctrl.listarLineasAccion);
router.get('/areas', ctrl.listarAreas);
// Títulos oficiales de objetivos/estrategias del PSEDATU (migración 076,
// tablas vacías hasta que se carguen) — lectura abierta, alimenta la
// migaja de pan de cada tarjeta.
router.get('/psedatu/titulos', ctrl.titulosPsedatu);
// Alimenta la pantalla "Fusionar duplicados" — mismo nivel de permiso que
// /fusionar, ya que es parte del mismo flujo de curación.
router.get('/duplicados-sugeridos', requiereRol(['superadmin']), ctrl.duplicadosSugeridos);
router.post('/fusionar', requiereRol(['superadmin']), ctrl.fusionar);
router.get('/:id', ctrl.obtener);

// "uso" y "nodos" son lectura, no una operación que afecte el proyecto
// de nadie (a diferencia de actualizar/cambiarActivo/fusionar) — quedan
// abiertas como el resto de la lectura del catálogo. Antes /uso era
// superadmin-only (venía de cuando el catálogo solo vivía en el panel
// de admin); la pantalla de Catálogo abierta a todos ya la llamaba sin
// chequear rol, así que cualquier usuario que expandía "N proyectos"
// recibía un 403.
router.get('/:id/uso', ctrl.uso);
router.get('/:id/nodos', ctrl.nodosVinculados);
router.put('/:id', requiereRol(['superadmin']), ctrl.actualizar);
router.patch('/:id/activo', requiereRol(['superadmin']), ctrl.cambiarActivo);

module.exports = router;
