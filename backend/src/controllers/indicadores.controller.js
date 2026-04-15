/**
 * ARCHIVO: indicadores.controller.js
 * PROPÓSITO: Controlador REST para indicadores de proyecto.
 *
 * MINI-CLASE: Controllers y la capa de transporte
 * ─────────────────────────────────────────────────────────────────
 * Un controller recibe la petición HTTP (req), extrae los datos,
 * llama a la capa de queries (lógica de datos), y devuelve la
 * respuesta HTTP (res). No contiene lógica de negocio compleja
 * ni SQL directo — eso vive en las queries.
 * ─────────────────────────────────────────────────────────────────
 */
const indicadoresQueries = require('../db/queries/indicadores.queries');

// GET /proyectos/:id/indicadores — solo los de nivel proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarPorProyecto(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id/indicadores — indicadores propios de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarPorEtapa(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/indicadores/todos — proyecto + etapas
async function listarTodosPorProyecto(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarTodosPorProyecto(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos/:id/indicadores
async function crear(req, res, next) {
  try {
    const indicador = await indicadoresQueries.crear(req.params.id, req.body);
    res.status(201).json({ datos: indicador, mensaje: 'Indicador creado' });
  } catch (err) {
    next(err);
  }
}

// PUT /indicadores/:id
async function actualizar(req, res, next) {
  try {
    const indicador = await indicadoresQueries.actualizar(req.params.id, req.body);
    if (!indicador) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: indicador, mensaje: 'Indicador actualizado' });
  } catch (err) {
    next(err);
  }
}

// DELETE /indicadores/:id
async function eliminar(req, res, next) {
  try {
    const resultado = await indicadoresQueries.eliminar(req.params.id);
    if (!resultado) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ mensaje: 'Indicador eliminado' });
  } catch (err) {
    next(err);
  }
}

// GET /indicadores/:id/resumen-aportaciones — meta, total aportado, disponible
async function resumenAportaciones(req, res, next) {
  try {
    const resumen = await indicadoresQueries.obtenerResumenAportaciones(req.params.id);
    if (!resumen) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: resumen });
  } catch (err) {
    next(err);
  }
}

module.exports = { listarPorProyecto, listarPorEtapa, listarTodosPorProyecto, crear, actualizar, eliminar, resumenAportaciones };
