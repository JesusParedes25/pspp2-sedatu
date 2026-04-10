/**
 * ARCHIVO: riesgos.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de riesgos y problemas.
 *
 * MINI-CLASE: Riesgos vs Problemas en gestión de proyectos
 * ─────────────────────────────────────────────────────────────────
 * Un RIESGO es algo que PODRÍA ocurrir y afectar al proyecto.
 * Un PROBLEMA es algo que YA ocurrió y está afectando. Ambos se
 * gestionan en la misma tabla con el campo "tipo" ('Riesgo' o
 * 'Problema'). Cada riesgo tiene un nivel de severidad (Bajo,
 * Medio, Alto, Crítico) y un estado de gestión (Abierto,
 * En_mitigacion, Resuelto, Cerrado). Se pueden vincular a
 * cualquier nivel del proyecto mediante entidad_tipo + entidad_id.
 * ─────────────────────────────────────────────────────────────────
 */
const riesgosQueries = require('../db/queries/riesgos.queries');
const { crearNotificacion } = require('../utils/notificaciones');

// GET /proyectos/:id/riesgos — Listar riesgos del proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorProyecto(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id/riesgos — Listar riesgos de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorEtapa(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos de etapa obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /riesgos/:id — Obtener un riesgo
async function obtenerPorId(req, res, next) {
  try {
    const riesgo = await riesgosQueries.obtenerRiesgoPorId(req.params.id);

    if (!riesgo) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: riesgo, mensaje: 'Riesgo obtenido' });
  } catch (err) {
    next(err);
  }
}

// POST /riesgos — Crear un riesgo
async function crear(req, res, next) {
  try {
    const datos = {
      ...req.body,
      id_reportador: req.usuario.id
    };

    const riesgo = await riesgosQueries.crearRiesgo(datos);

    res.status(201).json({ datos: riesgo, mensaje: 'Riesgo registrado exitosamente' });
  } catch (err) {
    next(err);
  }
}

// PUT /riesgos/:id — Actualizar un riesgo
async function actualizar(req, res, next) {
  try {
    const riesgo = await riesgosQueries.actualizarRiesgo(req.params.id, req.body);

    if (!riesgo) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: riesgo, mensaje: 'Riesgo actualizado' });
  } catch (err) {
    next(err);
  }
}

// DELETE /riesgos/:id — Eliminar un riesgo
async function eliminar(req, res, next) {
  try {
    const resultado = await riesgosQueries.eliminarRiesgo(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'Riesgo eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listarPorProyecto, listarPorEtapa, obtenerPorId, crear, actualizar, eliminar };
