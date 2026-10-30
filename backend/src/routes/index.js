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
const corregirCodificacionArchivo = require('../middleware/corregirCodificacionArchivo.middleware');

// Multer en memoria para archivos (max 200MB para shapefiles grandes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

// Permiso de captura para las rutas anidadas que escriben estructura
// (las rutas independientes lo aplican en su propio archivo de rutas).
const {
  exigirEdicionNodo, exigirEdicionProyecto, exigirEdicionDeEntidadEnCuerpo,
  exigirEdicionComentario, exigirEdicionRiesgo, exigirEdicionEvidencia,
  exigirEdicionIndicador, exigirEdicionMovimientoIndicador, exigirEdicionAportacion, exigirEdicionAportacionNueva,
  exigirResponsableNodo, exigirResponsableProyecto,
} = require('../middleware/permisos.middleware');

// Permiso de VISIBILIDAD (no de escritura) para las rutas de lectura que
// hoy no verifican nada — cierra el único caso donde la lectura no es
// total entre perfiles internos: un usuario 'externo' fuera de sus
// proyectos invitados (ver utils/alcance-lectura.js, docs/modelo-permisos.md).
const {
  exigirVisibilidadProyecto, exigirVisibilidadNodo, exigirVisibilidadRiesgo,
  exigirVisibilidadIndicador, exigirVisibilidadEntidadEnParams,
} = require('../utils/alcance-lectura');

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
const adminRoutes = require('./admin.routes');
const tareasRoutes = require('./tareas.routes');
const geoRoutes = require('./geo.routes');
const actividadRoutes = require('./actividad.routes');
const catalogoIndicadoresRoutes = require('./catalogo-indicadores.routes');

// Importar controllers para rutas anidadas
const etapasController = require('../controllers/etapas.controller');
const exportarController = require('../controllers/exportar.controller');
const accionesController = require('../controllers/acciones.controller');
const tareasController = require('../controllers/tareas.controller');
const evidenciasController = require('../controllers/evidencias.controller');
const riesgosController = require('../controllers/riesgos.controller');
const indicadoresController = require('../controllers/indicadores.controller');
const proyectosStatsController = require('../controllers/proyectos.stats.controller');
const bloqueosController = require('../controllers/bloqueos.controller');
const estadoController = require('../controllers/estado.controller');
const geografiaController = require('../controllers/geografia.controller');
const geoController = require('../controllers/geo.controller');
const dashboardController = require('../controllers/dashboard.controller');
const aportacionesController = require('../controllers/aportaciones.controller');
const indicadorMovimientosController = require('../controllers/indicador-movimientos.controller');
const miembrosController = require('../controllers/miembros.controller');
const nodoMiembrosController = require('../controllers/nodo-miembros.controller');
const solicitudesController = require('../controllers/solicitudes.controller');
const inicioController = require('../controllers/inicio.controller');
const panoramaController = require('../controllers/panorama.controller');
const carterasController = require('../controllers/carteras.controller');

const router = Router();

// ─── Rutas públicas ────────────────────────────────────────────
router.use('/auth', authRoutes);

// Imagen de encabezado (pública porque <img src> no envía JWT)
const proyectosController = require('../controllers/proyectos.controller');
router.get('/proyectos/:id/imagen', proyectosController.servirImagen);

// API de salida para el tablero ejecutivo externo. Va ANTES de
// verificarToken porque no la consume un usuario con sesión, sino otra
// plataforma con un token de servicio (ver api-token.middleware.js).
const publicoController = require('../controllers/publico.controller');
const { requiereApiToken } = require('../middleware/api-token.middleware');
router.get('/publico/indicadores', requiereApiToken, publicoController.indicadores);

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
router.use('/tareas', tareasRoutes);
router.use('/importar', importarRoutes);
router.use('/plantillas-importacion', plantillasRoutes);
router.use('/admin', adminRoutes);
router.use('/geo', geoRoutes);
router.use('/actividad', actividadRoutes);
router.use('/catalogo-indicadores', catalogoIndicadoresRoutes);

// ─── Rutas anidadas (conectan controllers de diferentes recursos) ─

// Etapas de un proyecto
router.get('/proyectos/:id/etapas', etapasController.listarPorProyecto);
router.get('/proyectos/:id/arbol', etapasController.obtenerArbol);
// Mismo mecanismo del Paso 1 (alcance de lectura) que ya protege el resto
// de la lectura estructural de un proyecto — antes, exportar no exigía
// ni siquiera el peldaño 'lectura' que exigirVisibilidadProyecto aplica a
// 'externo': cualquier usuario autenticado, sin relación con el
// proyecto, podía descargar su estructura completa. Para cualquier
// interno no cambia nada (ya veía cualquier proyecto).
router.get('/proyectos/:id/exportar', exigirVisibilidadProyecto(), exportarController.exportarProyecto);
router.post('/proyectos/:id/etapas', exigirResponsableProyecto(), etapasController.crear);

// Acciones de una etapa
router.get('/etapas/:id/acciones', accionesController.listarPorEtapa);
router.post('/etapas/:id/acciones', exigirResponsableNodo('etapa'), accionesController.crearEnEtapa);

// Acciones directas del proyecto (sin etapa)
router.get('/proyectos/:id/acciones', accionesController.listarDirectasProyecto);
router.post('/proyectos/:id/acciones', exigirResponsableProyecto(), accionesController.crearEnProyecto);

// Subacciones de una acción
router.get('/acciones/:id/subacciones', accionesController.listarSubacciones);
router.post('/acciones/:id/subacciones', exigirResponsableNodo('accion'), accionesController.crearSubaccion);
// toggle eliminado — usar PUT /acciones/:id con { estado } en body

// Indicadores vinculados a una acción (lectura + edición)
router.get('/acciones/:id/indicadores', accionesController.obtenerIndicadores);
router.put('/acciones/:id/indicadores', exigirEdicionNodo('accion'), accionesController.actualizarIndicadores);

// Importar estructura desde CSV
router.post('/proyectos/:id/importar-csv', exigirEdicionProyecto(), accionesController.importarCSV);

// Solicitudes de participación: el camino inverso a la invitación. Pedir
// entrar lo puede hacer cualquiera que vea el proyecto; resolverlas, quien
// designa participantes ahí (se verifica dentro del controller).
router.post('/proyectos/:id/solicitudes', solicitudesController.crear);
router.get('/proyectos/:id/solicitudes', solicitudesController.listarDeProyecto);
router.post('/etapas/:etapaId/solicitudes', solicitudesController.crear);
router.post('/acciones/:accionId/solicitudes', solicitudesController.crear);
router.post('/tareas/:tareaId/solicitudes', solicitudesController.crear);
router.get('/mis-solicitudes', solicitudesController.mias);
router.get('/solicitudes-por-resolver', solicitudesController.porResolver);
router.get('/solicitudes-resueltas', solicitudesController.resueltasPorMi);
router.post('/solicitudes/:id/responder', solicitudesController.responder);

// Invitaciones internas: las que el usuario tiene sin responder y su
// respuesta (aceptar / rechazar). Responder es del propio invitado, así
// que estas rutas no llevan verificación de gestión.
router.get('/mis-invitaciones', miembrosController.misInvitaciones);
router.post('/proyectos/:id/miembros/responder', miembrosController.responderInvitacion);
router.post('/etapas/:etapaId/miembros-nodo/responder', nodoMiembrosController.responder);
router.post('/acciones/:accionId/miembros-nodo/responder', nodoMiembrosController.responder);
router.post('/tareas/:tareaId/miembros-nodo/responder', nodoMiembrosController.responder);

// Tareas de una acción
router.get('/acciones/:id/tareas', tareasController.listar);
router.post('/acciones/:id/tareas', exigirResponsableNodo('accion'), tareasController.crear);

// Evidencias de etapas, acciones, riesgos y subacciones
router.get('/etapas/:id/evidencias', exigirVisibilidadNodo('etapa'), evidenciasController.listarPorEtapa);
router.post('/etapas/:id/evidencias', exigirEdicionNodo('etapa'), upload.single('archivo'), corregirCodificacionArchivo, evidenciasController.subirParaEtapa);
router.get('/acciones/:id/evidencias', exigirVisibilidadNodo('accion'), evidenciasController.listarPorAccion);
router.post('/acciones/:id/evidencias', exigirEdicionNodo('accion'), upload.single('archivo'), corregirCodificacionArchivo, evidenciasController.subirParaAccion);
router.get('/riesgos/:id/evidencias', exigirVisibilidadRiesgo(), evidenciasController.listarPorRiesgo);
router.post('/riesgos/:id/evidencias', exigirEdicionRiesgo(), upload.single('archivo'), corregirCodificacionArchivo, evidenciasController.subirParaRiesgo);
router.get('/subacciones/:id/evidencias', exigirVisibilidadNodo('accion'), evidenciasController.listarPorSubaccion);
router.post('/subacciones/:id/evidencias', exigirEdicionNodo('accion'), upload.single('archivo'), corregirCodificacionArchivo, evidenciasController.subirParaSubaccion);
router.get('/proyectos/:id/evidencias', exigirVisibilidadProyecto(), evidenciasController.listarPorProyecto);

// Documentos agregados (pestaña "Documentos" de Detalle, Fase 4) — incluye
// los del nodo y, por omisión, los de sus descendientes (?incluirHijos=false
// para solo el propio). Distinto de los endpoints exactos de arriba, que
// alimentan el modal "Adjuntar documento" (solo lo propio del nodo).
router.get('/etapas/:id/documentos', exigirVisibilidadNodo('etapa'), evidenciasController.obtenerDocumentosAgregados);
router.get('/acciones/:id/documentos', exigirVisibilidadNodo('accion'), evidenciasController.obtenerDocumentosAgregados);
router.get('/tareas/:id/documentos', exigirVisibilidadNodo('tarea'), evidenciasController.obtenerDocumentosAgregados);

// Riesgos de un proyecto, etapa, acción, subacción y tarea
//
// NOTA DE ALCANCE: solo /proyectos/:id/riesgos (listado a nivel proyecto)
// y GET /riesgos/:id (riesgos.routes.js) quedan protegidos en este PR —
// son los que el Paso 1/2 nombran explícitamente. Los listados por nodo
// de esta misma sección (etapa/acción/subacción/tarea) tienen el mismo
// hueco hoy (sin control) pero no se tocan aquí a propósito: no están en
// la lista pedida y se reportan aparte para no exceder el alcance de
// este PR.
router.get('/proyectos/:id/riesgos', exigirVisibilidadProyecto(), riesgosController.listarPorProyecto);
router.get('/etapas/:id/riesgos', riesgosController.listarPorEtapa);
router.get('/acciones/:id/riesgos', riesgosController.listarPorAccion);
router.get('/subacciones/:id/riesgos', riesgosController.listarPorSubaccion);
router.get('/tareas/:id/riesgos', riesgosController.listarPorTarea);
// Riesgos donde a este usuario le propusieron ser responsable y no ha
// respondido — misma bandeja que solicitudes-por-resolver, para Riesgo.
router.get('/riesgos-asignados-pendientes', riesgosController.listarAsignacionesPendientes);

// Indicadores de un proyecto (nivel proyecto, nivel etapa, o todos)
//
// NOTA DE ALCANCE: /etapas/:id/indicadores no se toca en este PR — mismo
// hueco de visibilidad hoy, pero fuera de lo nombrado en el Paso 1/2;
// reportado aparte.
router.get('/proyectos/:id/indicadores', exigirVisibilidadProyecto(), indicadoresController.listarPorProyecto);
router.get('/proyectos/:id/indicadores/todos', exigirVisibilidadProyecto(), indicadoresController.listarTodosPorProyecto);
router.post('/proyectos/:id/indicadores', exigirEdicionProyecto(), indicadoresController.crear);
router.get('/etapas/:id/indicadores', indicadoresController.listarPorEtapa);
router.get('/indicadores/mios', indicadoresController.listarMios);
router.get('/indicadores/:id', exigirVisibilidadIndicador(), indicadoresController.obtenerPorId);
router.put('/indicadores/:id', exigirEdicionIndicador(), indicadoresController.actualizar);
router.delete('/indicadores/:id', exigirEdicionIndicador(), indicadoresController.eliminar);
router.get('/indicadores/:id/resumen-aportaciones', indicadoresController.resumenAportaciones);
// `GET /indicadores/publicos` + `PATCH /indicadores/:id/publicar`
// (es_publicable) se retiraron: sin interfaz, sin consumidor, y la única
// ruta del módulo que no verificaba visibilidad de proyecto — ver Bloque
// 7 del encargo. La columna es_publicable se queda en la tabla sin usarse.
// `PATCH /indicadores/:id/valor` también se retiró — la captura manual
// ahora es POST /indicadores/:id/movimientos (ver abajo), que deja
// historial en vez de pisar el valor.

// Historial de movimientos de un indicador (migración 084) — captura
// manual y anulación; los automáticos (completar/avanzar una actividad
// vinculada) los inserta aportacionesController.procesarCambioNodo desde
// dentro de los endpoints de etapas/acciones/tareas/estado, no desde aquí.
router.get('/indicadores/:id/movimientos', exigirVisibilidadIndicador(), indicadorMovimientosController.listar);
router.post('/indicadores/:id/movimientos', exigirEdicionIndicador(), indicadorMovimientosController.crear);
router.patch('/movimientos/:id/anular', exigirEdicionMovimientoIndicador(), indicadorMovimientosController.anular);

// Aportaciones a indicadores
router.get('/indicadores/:id/aportaciones', exigirVisibilidadIndicador(), aportacionesController.listar);
router.post('/indicadores/:id/aportaciones', exigirEdicionAportacionNueva(), aportacionesController.crear);
router.patch('/aportaciones/:id', exigirEdicionAportacion(), aportacionesController.actualizar);
router.delete('/aportaciones/:id', exigirEdicionAportacion(), aportacionesController.eliminar);
router.get('/etapas/:id/aportaciones', exigirVisibilidadNodo('etapa'), aportacionesController.listarPorNodo);
router.get('/acciones/:id/aportaciones', exigirVisibilidadNodo('accion'), aportacionesController.listarPorNodo);
router.get('/tareas/:id/aportaciones', exigirVisibilidadNodo('tarea'), aportacionesController.listarPorNodo);
// `GET /proyectos/:id/indicadores/resumen` (resumenConValores) se retiró:
// cero consumidores en el frontend, y lo que calculaba (valor realizado
// desde las aportaciones) ya ES indicadores.valor_actual con el nuevo
// historial — habría quedado como un segundo cálculo redundante.

// Estadísticas del proyecto (para el resumen/dashboard)
router.get('/proyectos/:id/stats', proyectosStatsController.obtenerStats);
router.get('/proyectos/:id/actividades-sin-fecha', proyectosStatsController.obtenerActividadesSinFecha);
router.get('/proyectos/:id/actividad-reciente', proyectosController.actividadReciente);
router.get('/proyectos/:id/bitacora', proyectosController.bitacora);
router.get('/proyectos/:id/portada-resumen', proyectosController.portadaResumen);

// Conteo de descendientes (para confirm de cancelación en cascada)
router.get('/conteo-descendientes', estadoController.conteoDescendientes);

// Cambio de estado genérico (alternativa a PUT en cada recurso)
router.put('/estado', estadoController.cambiarEstado);
// Apaga estado_override y recalcula el estatus automático de inmediato
router.put('/estado/automatico', estadoController.restaurarEstadoAutomatico);

// Agenda del usuario autenticado
router.get('/agenda', accionesController.agenda);

// Campos extra schema (para DataGrid dinámico)
router.get('/proyectos/:id/campos-extra-schema', etapasController.obtenerCamposExtraSchema);

// Cobertura geográfica — de un solo proyecto/nodo, mismo tratamiento que
// etapas/:id o riesgos/:id (Fase 2 / Paso 1): lectura total entre
// internos, solo se cierra el caso 'externo' fuera de sus proyectos
// invitados. NO lleva alcanceProyectosUsuario (eso es para vistas
// agregadas "todos los proyectos que veo", esto es "puedo ver ESTE").
router.get('/cobertura/:tipo/:id', exigirVisibilidadEntidadEnParams(), geografiaController.obtenerCobertura);
router.post('/cobertura/:tipo/:id', geografiaController.agregarCobertura);
router.delete('/cobertura/:id', geografiaController.eliminarCobertura);
router.get('/proyectos/:id/cobertura', exigirVisibilidadProyecto(), geografiaController.obtenerCoberturaProyecto);
router.get('/proyectos/:id/cobertura-detallada', exigirVisibilidadProyecto(), geografiaController.obtenerCoberturaDetallada);
router.get('/proyectos/:id/mapa-territorial', exigirVisibilidadProyecto(), geoController.obtenerMapaTerritorial);

// Módulo cartográfico territorial
router.get('/mapa/resumen-estados', geografiaController.resumenPorEstados);
router.get('/mapa/estado/:id', geografiaController.resumenTerritorial);

// Dashboard ejecutivo
router.get('/dashboard', dashboardController.obtenerDashboard);

// Dashboard personalizado del usuario
router.get('/inicio', inicioController.obtenerInicio);
router.get('/inicio/resumen-tarjetas', inicioController.obtenerResumenTarjetas);
router.get('/inicio/mapa', geoController.obtenerMapaInicio);
router.get('/inicio/mapa/zm', geoController.obtenerMapaZmInicio);
router.get('/inicio/mapa/urgencia', geoController.obtenerUrgenciaMapaInicio);
router.get('/inicio/mapa/zm/urgencia', geoController.obtenerUrgenciaMapaZmInicio);
router.get('/inicio/filtros/proyectos', inicioController.obtenerProyectosFiltro);
router.get('/inicio/filtros/carteras', inicioController.obtenerCarterasFiltro);

// Panorama del proyecto (tab Panorama) — incluye participantes, que
// Fase 2/Paso 1 (Bloque B, docs/modelo-permisos.md) exige acotar para
// 'externo' a los proyectos a los que fue invitado; exigirVisibilidadProyecto
// ya cierra exactamente ese caso (y de paso cierra el mismo hueco de
// visibilidad que tenía el resto del panorama, sin filtro hasta ahora).
router.get('/proyectos/:id/panorama', exigirVisibilidadProyecto(), panoramaController.obtenerPanorama);
// Panorama compacto (hover de ProyectoCard en Inicio): árbol ligero + actividad reciente
router.get('/proyectos/:id/panorama-rapido', panoramaController.obtenerPanoramaRapido);

// Miembros de etapas, acciones y tareas (nodo_miembros)
router.get('/etapas/:etapaId/miembros-nodo', nodoMiembrosController.listar);
router.post('/etapas/:etapaId/miembros-nodo', nodoMiembrosController.agregar);
router.put('/etapas/:etapaId/miembros-nodo/:userId', nodoMiembrosController.actualizar);
router.delete('/etapas/:etapaId/miembros-nodo/:userId', nodoMiembrosController.eliminar);
router.get('/acciones/:accionId/miembros-nodo', nodoMiembrosController.listar);
router.post('/acciones/:accionId/miembros-nodo', nodoMiembrosController.agregar);
router.put('/acciones/:accionId/miembros-nodo/:userId', nodoMiembrosController.actualizar);
router.delete('/acciones/:accionId/miembros-nodo/:userId', nodoMiembrosController.eliminar);
router.get('/tareas/:tareaId/miembros-nodo', nodoMiembrosController.listar);
router.post('/tareas/:tareaId/miembros-nodo', nodoMiembrosController.agregar);
router.put('/tareas/:tareaId/miembros-nodo/:userId', nodoMiembrosController.actualizar);
router.delete('/tareas/:tareaId/miembros-nodo/:userId', nodoMiembrosController.eliminar);

// Miembros e invitaciones de proyecto — mismo criterio que panorama: la
// lista de miembros es, para 'externo', el mismo caso de "a quiénes
// devuelve" que rige el directorio (docs/modelo-permisos.md, Bloque B).
router.get('/proyectos/:id/miembros', exigirVisibilidadProyecto(), miembrosController.listarMiembros);
router.post('/proyectos/:id/miembros', miembrosController.agregarMiembro);
router.delete('/proyectos/:id/miembros/:userId', miembrosController.eliminarMiembro);
router.post('/proyectos/:id/invitaciones', miembrosController.crearInvitacion);

// Carteras de proyectos
router.get('/carteras', carterasController.listar);
router.post('/carteras', carterasController.crear);
router.get('/carteras/:id', carterasController.obtener);
router.put('/carteras/:id', carterasController.actualizar);
router.delete('/carteras/:id', carterasController.eliminar);
router.patch('/carteras/:id/administrador', carterasController.reasignarAdministrador);
router.get('/carteras/:id/confirmar-eliminar', carterasController.confirmarEliminar);
router.get('/carteras/:id/proyectos', carterasController.listarProyectos);
router.get('/carteras/:id/resumen', carterasController.resumen);
router.get('/carteras/:id/mapa', carterasController.mapa);
router.get('/carteras/:id/actividad', carterasController.actividad);
router.post('/carteras/:id/proyectos', carterasController.agregarProyectos);
router.delete('/carteras/:id/proyectos/:proyectoId', carterasController.quitarProyecto);

module.exports = router;
