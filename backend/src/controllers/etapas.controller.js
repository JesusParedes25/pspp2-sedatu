/**
 * ARCHIVO: etapas.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de etapas.
 *
 * MINI-CLASE: Etapas como contenedores de acciones
 * ─────────────────────────────────────────────────────────────────
 * Las etapas organizan las acciones de un proyecto en fases lógicas.
 * El porcentaje de una etapa se CALCULA automáticamente como promedio
 * de sus acciones no canceladas. Las fechas también se calculan
 * desde las acciones (fecha_inicio = la más temprana, fecha_fin = la
 * más tardía). El controller NO modifica estos campos directamente;
 * eso lo hace recalculos.js cuando se actualiza una acción.
 * ─────────────────────────────────────────────────────────────────
 */
const etapasQueries = require('../db/queries/etapas.queries');
const { recalcularProyecto } = require('../utils/recalculos');

// GET /proyectos/:id/etapas — Listar etapas de un proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const etapas = await etapasQueries.obtenerEtapasPorProyecto(
      req.params.id,
      req.query.id_dg || null
    );

    res.json({ datos: etapas, mensaje: 'Etapas obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id — Obtener una etapa
async function obtenerPorId(req, res, next) {
  try {
    const etapa = await etapasQueries.obtenerEtapaPorId(req.params.id);

    if (!etapa) {
      return res.status(404).json({
        error: true,
        mensaje: 'Etapa no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: etapa, mensaje: 'Etapa obtenida' });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos/:id/etapas — Crear una etapa
async function crear(req, res, next) {
  try {
    const etapa = await etapasQueries.crearEtapa(req.params.id, req.body);

    res.status(201).json({ datos: etapa, mensaje: 'Etapa creada exitosamente' });
  } catch (err) {
    next(err);
  }
}

// PUT /etapas/:id — Actualizar una etapa
async function actualizar(req, res, next) {
  try {
    const etapa = await etapasQueries.actualizarEtapa(req.params.id, req.body);

    if (!etapa) {
      return res.status(404).json({
        error: true,
        mensaje: 'Etapa no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: etapa, mensaje: 'Etapa actualizada' });
  } catch (err) {
    next(err);
  }
}

// DELETE /etapas/:id — Eliminar una etapa
async function eliminar(req, res, next) {
  try {
    const resultado = await etapasQueries.eliminarEtapa(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Etapa no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    // Recalcular el proyecto después de eliminar la etapa
    if (resultado.id_proyecto) {
      await recalcularProyecto(resultado.id_proyecto);
    }

    res.json({ datos: resultado, mensaje: 'Etapa eliminada' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listarPorProyecto, obtenerPorId, crear, actualizar, eliminar };
