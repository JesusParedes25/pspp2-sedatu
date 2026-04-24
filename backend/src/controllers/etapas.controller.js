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
const pool = require('../db/pool');
const { recalcularProyecto } = require('../utils/recalculos');
const { cambiarEstado: cambiarEstadoUtil } = require('../utils/validaciones-estado');

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
// Si el body incluye 'estado', delega al módulo compartido validaciones-estado.
async function actualizar(req, res, next) {
  const { estado, motivo_bloqueo, nota_resolucion, ...otrosDatos } = req.body;
  const etapaId = req.params.id;
  const idUsuario = req.usuario?.id;

  // Si hay cambio de estado, usar transacción con módulo compartido
  if (estado) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await cambiarEstadoUtil(
        'Etapa', etapaId, estado,
        { motivoBloqueo: motivo_bloqueo, notaResolucion: nota_resolucion, idUsuario },
        client
      );

      // Actualizar campos no-estado si los hay
      if (Object.keys(otrosDatos).length > 0) {
        await etapasQueries.actualizarEtapa(etapaId, otrosDatos, client);
      }

      // Recalcular proyecto padre
      const etapa = await client.query('SELECT id_proyecto FROM etapas WHERE id = $1', [etapaId]);
      if (etapa.rows[0]?.id_proyecto) {
        await recalcularProyecto(etapa.rows[0].id_proyecto, client);
      }

      await client.query('COMMIT');

      const actualizada = await etapasQueries.obtenerEtapaPorId(etapaId);
      return res.json({ datos: actualizada, mensaje: 'Etapa actualizada' });
    } catch (err) {
      await client.query('ROLLBACK');
      const status = err.statusCode || 500;
      if (status < 500) {
        return res.status(status).json({ error: true, mensaje: err.message, codigo: 'VALIDACION_NEGOCIO' });
      }
      return next(err);
    } finally {
      client.release();
    }
  }

  // Sin cambio de estado: actualizar campos directamente
  try {
    const etapa = await etapasQueries.actualizarEtapa(etapaId, otrosDatos);
    if (!etapa) {
      return res.status(404).json({ error: true, mensaje: 'Etapa no encontrada', codigo: 'NO_ENCONTRADO' });
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
