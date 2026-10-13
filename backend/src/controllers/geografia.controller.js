/**
 * ARCHIVO: geografia.controller.js
 * PROPÓSITO: Endpoints para catálogo geográfico y cobertura.
 */
const geografiaQueries = require('../db/queries/geografia.queries');
const { tienePeldanoProyecto, tienePeldanoNodo } = require('../utils/autorizacion');

// Captura sobre el nodo (o el proyecto, si tipo_entidad es 'proyecto') —
// ligar/quitar territorio es una forma de capturar, igual que registrar
// avance o reportar un riesgo (docs/modelo-permisos.md). No tenía ningún
// chequeo: cualquier usuario autenticado podía ligar o quitar territorio
// de cualquier nodo de cualquier proyecto.
async function puedeCapturarEnEntidad(usuario, tipoEntidad, idEntidad) {
  if (tipoEntidad === 'proyecto') return tienePeldanoProyecto(usuario, idEntidad, 'captura');
  return tienePeldanoNodo(usuario, tipoEntidad, idEntidad, 'captura');
}

function rechazarCobertura(res) {
  return res.status(403).json({
    error: true,
    codigo: 'NO_AUTORIZADO',
    mensaje: 'No tienes permisos para modificar el territorio de este elemento.',
  });
}

// GET /catalogos/estados
async function obtenerEstados(req, res, next) {
  try {
    const estados = await geografiaQueries.obtenerEstados();
    res.json({ datos: estados, mensaje: 'Estados obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/municipios?id_estado=X
async function obtenerMunicipios(req, res, next) {
  try {
    const { id_estado } = req.query;
    if (!id_estado) return res.status(400).json({ error: 'Se requiere id_estado' });
    const municipios = await geografiaQueries.obtenerMunicipios(id_estado);
    res.json({ datos: municipios, mensaje: 'Municipios obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /cobertura/:tipo/:id
async function obtenerCobertura(req, res, next) {
  try {
    const { tipo, id } = req.params;
    const cobertura = await geografiaQueries.obtenerCobertura(tipo, id);
    res.json({ datos: cobertura, mensaje: 'Cobertura obtenida' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/cobertura — toda la cobertura del proyecto (incluye etapas/acciones)
async function obtenerCoberturaProyecto(req, res, next) {
  try {
    const cobertura = await geografiaQueries.obtenerCoberturaProyecto(req.params.id);
    res.json({ datos: cobertura, mensaje: 'Cobertura del proyecto obtenida' });
  } catch (err) {
    next(err);
  }
}

// POST /cobertura/:tipo/:id
async function agregarCobertura(req, res, next) {
  try {
    const { tipo, id } = req.params;
    const { id_estado, id_municipio } = req.body;
    if (!id_estado) return res.status(400).json({ error: 'Se requiere id_estado' });
    if (!(await puedeCapturarEnEntidad(req.usuario, tipo, id))) return rechazarCobertura(res);
    const registro = await geografiaQueries.agregarCobertura(tipo, id, id_estado, id_municipio);
    res.status(201).json({ datos: registro, mensaje: 'Cobertura agregada' });
  } catch (err) {
    next(err);
  }
}

// DELETE /cobertura/:id — el id es de la fila de cobertura, no del nodo;
// hay que resolver a qué nodo/proyecto pertenece antes de poder verificar
// el permiso.
async function eliminarCobertura(req, res, next) {
  try {
    const fila = await geografiaQueries.obtenerCoberturaPorId(req.params.id);
    if (!fila) return res.status(404).json({ error: 'Registro no encontrado' });
    if (!(await puedeCapturarEnEntidad(req.usuario, fila.tipo_entidad, fila.id_entidad))) return rechazarCobertura(res);
    const eliminado = await geografiaQueries.eliminarCobertura(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ mensaje: 'Cobertura eliminada' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/cobertura-detallada — coverage per entity for VistaLista chips
async function obtenerCoberturaDetallada(req, res, next) {
  try {
    const datos = await geografiaQueries.obtenerCoberturaDetalladaProyecto(req.params.id);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// GET /mapa/resumen-estados — coropletas para el mapa territorial
async function resumenPorEstados(req, res, next) {
  try {
    const filtros = {};
    if (req.query.id_dg) filtros.id_dg = req.query.id_dg;
    const datos = await geografiaQueries.obtenerResumenPorEstados(filtros);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// GET /mapa/estado/:id — drill-down territorial rico
async function resumenTerritorial(req, res, next) {
  try {
    const filtros = {};
    if (req.query.id_dg) filtros.id_dg = req.query.id_dg;
    const datos = await geografiaQueries.obtenerResumenTerritorial(req.params.id, filtros);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/zonas-metropolitanas
async function obtenerZonasMetropolitanas(req, res, next) {
  try {
    const zm = await geografiaQueries.obtenerZonasMetropolitanas();
    res.json({ datos: zm, mensaje: 'Zonas metropolitanas obtenidas' });
  } catch (err) { next(err); }
}

// GET /catalogos/municipios-por-clave?cve_ent=XX
async function obtenerMunicipiosPorClave(req, res, next) {
  try {
    const { cve_ent } = req.query;
    if (!cve_ent) return res.status(400).json({ error: true, mensaje: 'Se requiere cve_ent' });
    const municipios = await geografiaQueries.obtenerMunicipiosPorEstadoClave(cve_ent);
    res.json({ datos: municipios, mensaje: 'Municipios obtenidos' });
  } catch (err) { next(err); }
}

module.exports = {
  obtenerEstados,
  obtenerMunicipios,
  obtenerMunicipiosPorClave,
  obtenerZonasMetropolitanas,
  obtenerCobertura,
  obtenerCoberturaProyecto,
  agregarCobertura,
  eliminarCobertura,
  obtenerCoberturaDetallada,
  resumenPorEstados,
  resumenTerritorial,
};
