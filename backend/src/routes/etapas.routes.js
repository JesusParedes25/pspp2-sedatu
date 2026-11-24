/**
 * ARCHIVO: etapas.routes.js
 * PROPÓSITO: Rutas CRUD de etapas.
 *
 * NOTA TÉCNICA: Rutas anidadas vs independientes
 * ─────────────────────────────────────────────────────────────────
 * Las etapas tienen dos tipos de rutas: anidadas bajo proyectos
 * (GET/POST /proyectos/:id/etapas) para listar y crear dentro de
 * un proyecto, e independientes (GET/PUT/DELETE /etapas/:id) para
 * operar sobre una etapa específica. Las rutas anidadas se montan
 * en proyectos.routes.js referenciando este controller; las
 * independientes se montan aquí directamente.
 * ─────────────────────────────────────────────────────────────────
 */
const { Router } = require('express');
const etapasController = require('../controllers/etapas.controller');
const indicadoresController = require('../controllers/indicadores.controller');
const { exigirEdicionNodo } = require('../middleware/permisos.middleware');
const { exigirVisibilidadNodo } = require('../utils/alcance-lectura');

const router = Router();

// Lectura: abierta a cualquier interno (la plataforma es de visibilidad
// total entre perfiles internos); solo se cierra para 'externo' fuera de
// los proyectos a los que fue invitado (exigirVisibilidadNodo, ver
// docs/modelo-permisos.md). Escritura: solo quien puede capturar.
//
// Esta misma ruta también estaba declarada en routes/index.js, montada
// DESPUÉS de este router (router.use('/etapas', ...) va primero) — por
// orden de montaje, Express siempre atendía ESTA versión y la de
// routes/index.js nunca se ejecutaba; se quedó sin el candado que su
// propio comentario de arriba decía que debía llevar. Corregido aquí; la
// declaración muerta en routes/index.js se quitó (paso 13 DGTIC).
router.get('/:id/indicadores', exigirVisibilidadNodo('etapa'), indicadoresController.listarPorEtapa);
router.get('/:id', exigirVisibilidadNodo('etapa'), etapasController.obtenerPorId);
router.put('/:id', exigirEdicionNodo('etapa'), etapasController.actualizar);
// Sin exigirEdicionNodo aquí a propósito: este endpoint mezcla registrar
// avance (requiere 'captura') y editar la ficha (requiere 'responsable')
// bajo la misma ruta — el controller decide el mínimo según los campos
// del payload (ver minimoParaPatchNodo en utils/autorizacion.js).
router.patch('/:id', etapasController.patchAvanceSemaforo);
router.patch('/:id/campo', exigirEdicionNodo('etapa'), etapasController.patchCampo);
router.post('/:id/duplicar', exigirEdicionNodo('etapa'), etapasController.duplicar);
router.delete('/:id', etapasController.eliminar);   // verifica adentro (puedeGestionarNodo)

module.exports = router;
