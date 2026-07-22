/**
 * ARCHIVO: geo.routes.js
 * PROPÓSITO: Rutas para datos geográficos desde PostGIS.
 *            Sirve selectores y GeoJSON simplificado.
 */
const { Router } = require('express');
const geoController = require('../controllers/geo.controller');

const router = Router();

router.get('/estados/geojson', geoController.obtenerEstadosGeoJSON);
router.get('/estados', geoController.obtenerEstados);
router.get('/municipios/geojson', geoController.obtenerMunicipiosGeoJSON);
router.get('/municipios/buscar', geoController.buscarMunicipios);
router.get('/municipios', geoController.obtenerMunicipios);
router.get('/zm/geojson', geoController.obtenerZMGeoJSON);
router.get('/zm', geoController.obtenerZM);

router.get('/territorio/estado/:cve_ent/detalle', geoController.obtenerDetalleEstado);
router.get('/territorio/estado/:cve_ent/municipios-actividad', geoController.obtenerMunicipiosActividadEstado);
router.get('/territorio/zm/:gid/detalle', geoController.obtenerDetalleZM);

module.exports = router;
