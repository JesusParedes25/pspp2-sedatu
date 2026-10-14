/**
 * ARCHIVO: bloqueos.routes.js
 * PROPÓSITO: Rutas REST para bloqueos.
 *
 * MINI-CLASE: Rutas de consulta y resolución
 * ─────────────────────────────────────────────────────────────────
 * GET /bloqueos          → historial por entidad (query params)
 * GET /bloqueos/activo   → bloqueo activo de una entidad
 * PUT /bloqueos/:id/resolver → cerrar bloqueo con nota de resolución
 * La creación de bloqueos se maneja internamente en cambiarEstado().
 *
 * Leer (GET) y escribir (PUT /resolver) exigen criterios distintos a
 * propósito: un bloqueo es parte de la bitácora del nodo — visibilidad
 * total entre perfiles internos, como cualquier otro dato de proyecto
 * (ver docs/modelo-permisos.md) — así que los GET solo cierran el caso
 * 'externo' fuera de sus proyectos invitados (exigirVisibilidadDeEntidadEnQuery).
 * Resolverlo sigue siendo una acción, no una lectura: exige captura-or-
 * superior en la entidad, o haber creado el bloqueo (exigirResolverBloqueo,
 * sin cambios desde Fase 2 / Paso 0).
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const ctrl = require('../controllers/bloqueos.controller');
const { exigirResolverBloqueo } = require('../middleware/permisos.middleware');
const { exigirVisibilidadDeEntidadEnQuery } = require('../utils/alcance-lectura');

const router = Router();

router.get('/',       exigirVisibilidadDeEntidadEnQuery(), ctrl.listarHistorial);
router.get('/activo', exigirVisibilidadDeEntidadEnQuery(), ctrl.obtenerActivo);
router.put('/:id/resolver', exigirResolverBloqueo(), ctrl.resolverBloqueo);

module.exports = router;
