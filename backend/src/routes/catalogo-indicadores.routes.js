/**
 * ARCHIVO: catalogo-indicadores.routes.js
 * PROPÓSITO: Rutas del catálogo de indicadores.
 *
 * Lectura y alta abiertas a cualquier usuario autenticado (sin eso no
 * podría elegir indicadores al capturar su proyecto, ni agregar el que
 * le falte); edición, retiro y consulta de uso reservadas a superadmin,
 * que son las operaciones que afectan proyectos ajenos.
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
router.post('/fusionar', requiereRol(['superadmin']), ctrl.fusionar);
router.get('/:id', ctrl.obtener);

router.get('/:id/uso', requiereRol(['superadmin']), ctrl.uso);
router.put('/:id', requiereRol(['superadmin']), ctrl.actualizar);
router.patch('/:id/activo', requiereRol(['superadmin']), ctrl.cambiarActivo);

module.exports = router;
