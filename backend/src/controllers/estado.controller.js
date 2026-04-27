/**
 * ARCHIVO: estado.controller.js
 * PROPÓSITO: Endpoints genéricos para cambio de estado y conteo de
 *            descendientes. Delega toda la lógica a validaciones-estado.js.
 *
 * MINI-CLASE: Controller delgado con transacción explícita
 * ─────────────────────────────────────────────────────────────────
 * El cambio de estado puede involucrar múltiples tablas (cascada,
 * bloqueos, auditoría). Todo ocurre dentro de una transacción.
 * Si algo falla, ROLLBACK deshace todo. El controller solo abre
 * la transacción, llama al módulo compartido, y responde.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const {
  cambiarEstado: cambiarEstadoUtil,
  contarDescendientes,
  verificarAutoCompletarPadre
} = require('../utils/validaciones-estado');
const { recalcularEtapa, recalcularProyecto } = require('../utils/recalculos');

/**
 * PUT /api/v1/estado
 * Body: { entidad_tipo, entidad_id, estado, motivo_bloqueo?, nota_resolucion? }
 */
async function cambiarEstado(req, res) {
  const { entidad_tipo, entidad_id, estado, motivo_bloqueo, nota_resolucion } = req.body;
  const idUsuario = req.usuario?.id;

  if (!entidad_tipo || !entidad_id || !estado) {
    return res.status(400).json({
      mensaje: 'Campos requeridos: entidad_tipo, entidad_id, estado'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultado = await cambiarEstadoUtil(
      entidad_tipo, entidad_id, estado,
      { motivoBloqueo: motivo_bloqueo, notaResolucion: nota_resolucion, idUsuario },
      client
    );

    // Auto-completar padre si todos los hijos están terminados
    if (['Completada', 'Cancelada'].includes(estado)) {
      await verificarAutoCompletarPadre(entidad_tipo, entidad_id, idUsuario, client);
    }

    // Recalcular porcentajes en cascada tras cambio de estado
    await recalcularTrasEstado(entidad_tipo, entidad_id, client);

    await client.query('COMMIT');

    res.json({
      datos: resultado,
      mensaje: `Estado cambiado de ${resultado.estadoAnterior} a ${resultado.estadoNuevo}`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.statusCode || 500;
    res.status(status).json({ mensaje: err.message });
  } finally {
    client.release();
  }
}

/**
 * GET /api/v1/conteo-descendientes?entidad_tipo=X&entidad_id=UUID
 */
async function conteoDescendientes(req, res) {
  const { entidad_tipo, entidad_id } = req.query;

  if (!entidad_tipo || !entidad_id) {
    return res.status(400).json({
      mensaje: 'Parámetros requeridos: entidad_tipo, entidad_id'
    });
  }

  try {
    const conteo = await contarDescendientes(entidad_tipo, entidad_id);
    res.json({ datos: conteo });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ mensaje: err.message });
  }
}

/**
 * Tras cambiar estado, recalcula porcentajes en cascada.
 * Determina la etapa y proyecto afectados según el tipo de entidad.
 */
async function recalcularTrasEstado(entidadTipo, entidadId, client) {
  if (entidadTipo === 'Subaccion' || entidadTipo === 'Accion') {
    const accion = await client.query(
      'SELECT id_etapa, id_proyecto, id_accion_padre FROM acciones WHERE id = $1',
      [entidadId]
    );
    const fila = accion.rows[0];
    if (!fila) return;

    // Si es subacción, recalcular la acción padre primero
    if (fila.id_accion_padre) {
      const padre = await client.query(
        'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1',
        [fila.id_accion_padre]
      );
      const p = padre.rows[0];
      if (p?.id_etapa) await recalcularEtapa(p.id_etapa, client);
      else if (p?.id_proyecto) await recalcularProyecto(p.id_proyecto, client);
    } else {
      if (fila.id_etapa) await recalcularEtapa(fila.id_etapa, client);
      else if (fila.id_proyecto) await recalcularProyecto(fila.id_proyecto, client);
    }
  }

  if (entidadTipo === 'Etapa') {
    const etapa = await client.query(
      'SELECT id_proyecto FROM etapas WHERE id = $1', [entidadId]
    );
    if (etapa.rows[0]?.id_proyecto) {
      await recalcularProyecto(etapa.rows[0].id_proyecto, client);
    }
  }

  // Proyecto: recalcular el propio proyecto
  if (entidadTipo === 'Proyecto') {
    await recalcularProyecto(entidadId, client);
  }
}

module.exports = { cambiarEstado, conteoDescendientes };
