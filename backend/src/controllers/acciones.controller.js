/**
 * ARCHIVO: acciones.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de acciones.
 *
 * MINI-CLASE: Acciones y el recálculo en cascada
 * ─────────────────────────────────────────────────────────────────
 * Las acciones son el ÚNICO nivel donde el porcentaje se edita
 * manualmente. Cuando se actualiza porcentaje_avance de una acción,
 * el controller llama a recalcularEtapa() que a su vez llama a
 * recalcularProyecto(). Este flujo es explícito (no automático
 * con triggers) para que sea 100% depurable. Si algo falla en el
 * recálculo, el error aparece en el stack trace del controller.
 * ─────────────────────────────────────────────────────────────────
 */
const accionesQueries = require('../db/queries/acciones.queries');

// GET /etapas/:id/acciones — Listar acciones de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const acciones = await accionesQueries.obtenerAccionesPorEtapa(req.params.id);
    res.json({ datos: acciones, mensaje: 'Acciones obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/acciones — Acciones directas del proyecto (sin etapa)
async function listarDirectasProyecto(req, res, next) {
  try {
    const acciones = await accionesQueries.obtenerAccionesDirectasProyecto(req.params.id);
    res.json({ datos: acciones, mensaje: 'Acciones directas obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /acciones/:id — Obtener una acción
async function obtenerPorId(req, res, next) {
  try {
    const accion = await accionesQueries.obtenerAccionPorId(req.params.id);

    if (!accion) {
      return res.status(404).json({
        error: true,
        mensaje: 'Acción no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: accion, mensaje: 'Acción obtenida' });
  } catch (err) {
    next(err);
  }
}

// POST /etapas/:id/acciones — Crear acción en una etapa
async function crearEnEtapa(req, res, next) {
  try {
    const accion = await accionesQueries.crearAccionEnEtapa(req.params.id, req.body);
    res.status(201).json({ datos: accion, mensaje: 'Acción creada exitosamente' });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos/:id/acciones — Crear acción directa en proyecto
async function crearEnProyecto(req, res, next) {
  try {
    const accion = await accionesQueries.crearAccionEnProyecto(req.params.id, req.body);
    res.status(201).json({ datos: accion, mensaje: 'Acción creada exitosamente' });
  } catch (err) {
    next(err);
  }
}

// PUT /acciones/:id — Actualizar acción (dispara recálculo en cascada)
async function actualizar(req, res, next) {
  try {
    const accion = await accionesQueries.actualizarAccion(
      req.params.id,
      req.body,
      req.usuario.id
    );

    res.json({ datos: accion, mensaje: 'Acción actualizada' });
  } catch (err) {
    // Errores de validación de negocio tienen mensaje descriptivo
    if (err.message.includes('motivo_bloqueo') || err.message.includes('evidencia')) {
      return res.status(400).json({
        error: true,
        mensaje: err.message,
        codigo: 'VALIDACION_NEGOCIO'
      });
    }
    next(err);
  }
}

// DELETE /acciones/:id — Eliminar acción
async function eliminar(req, res, next) {
  try {
    const resultado = await accionesQueries.eliminarAccion(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Acción no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'Acción eliminada' });
  } catch (err) {
    next(err);
  }
}

// GET /acciones/:id/subacciones — Listar subacciones de una acción
async function listarSubacciones(req, res, next) {
  try {
    const subacciones = await accionesQueries.obtenerSubacciones(req.params.id);
    res.json({ datos: subacciones, mensaje: 'Subacciones obtenidas' });
  } catch (err) {
    next(err);
  }
}

// POST /acciones/:id/subacciones — Crear subacción
async function crearSubaccion(req, res, next) {
  try {
    const subaccion = await accionesQueries.crearSubaccion(req.params.id, req.body);
    res.status(201).json({ datos: subaccion, mensaje: 'Subacción creada' });
  } catch (err) {
    next(err);
  }
}

// PUT /subacciones/:id/toggle — Alternar subacción Completada/Pendiente
async function toggleSubaccion(req, res, next) {
  try {
    const resultado = await accionesQueries.toggleSubaccion(req.params.id);
    res.json({ datos: resultado, mensaje: 'Subacción actualizada' });
  } catch (err) {
    if (err.message.includes('no encontrada') || err.message.includes('no es una')) {
      return res.status(400).json({ error: true, mensaje: err.message, codigo: 'VALIDACION_NEGOCIO' });
    }
    next(err);
  }
}

// POST /proyectos/:id/importar-csv — Importar estructura desde CSV
async function importarCSV(req, res, next) {
  try {
    const { filas } = req.body;
    if (!filas || !Array.isArray(filas) || filas.length === 0) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere un array "filas" con la estructura a importar',
        codigo: 'DATOS_INVALIDOS'
      });
    }
    const resultado = await accionesQueries.importarEstructuraCSV(req.params.id, filas);
    res.status(201).json({ datos: resultado, mensaje: 'Estructura importada exitosamente' });
  } catch (err) {
    next(err);
  }
}

// GET /agenda — Obtener acciones del usuario para la agenda
async function agenda(req, res, next) {
  try {
    const { desde, hasta } = req.query;

    // Si no se especifican fechas, usar la semana actual
    const fechaDesde = desde || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fechaHasta = hasta || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const acciones = await accionesQueries.obtenerAccionesAgenda(
      req.usuario.id,
      fechaDesde,
      fechaHasta
    );

    res.json({ datos: acciones, mensaje: 'Agenda obtenida' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarPorEtapa,
  listarDirectasProyecto,
  obtenerPorId,
  crearEnEtapa,
  crearEnProyecto,
  crearSubaccion,
  listarSubacciones,
  toggleSubaccion,
  actualizar,
  eliminar,
  agenda,
  importarCSV
};
