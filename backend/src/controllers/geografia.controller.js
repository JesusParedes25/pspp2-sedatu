/**
 * ARCHIVO: geografia.controller.js
 * PROPÓSITO: Endpoints para catálogo geográfico y cobertura.
 */
const geografiaQueries = require('../db/queries/geografia.queries');

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
    const registro = await geografiaQueries.agregarCobertura(tipo, id, id_estado, id_municipio);
    res.status(201).json({ datos: registro, mensaje: 'Cobertura agregada' });
  } catch (err) {
    next(err);
  }
}

// DELETE /cobertura/:id
async function eliminarCobertura(req, res, next) {
  try {
    const eliminado = await geografiaQueries.eliminarCobertura(req.params.id);
    if (!eliminado) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ mensaje: 'Cobertura eliminada' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  obtenerEstados,
  obtenerMunicipios,
  obtenerCobertura,
  obtenerCoberturaProyecto,
  agregarCobertura,
  eliminarCobertura,
};
