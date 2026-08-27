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
  verificarAutoCompletarPadre,
  restaurarEstadoAutomatico: restaurarEstadoAutomaticoUtil
} = require('../utils/validaciones-estado');
const { recalcularEtapa, recalcularProyecto } = require('../utils/recalculos');
const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');
const { recalcularAportacionesProyecto } = require('../db/queries/aportaciones.queries');
const { registrarActividad } = require('../utils/actividad-log');
const { obtenerProyectoId, recalcularPadres } = require('../utils/avance-semaforo');

// Tabla real por tipo de entidad — Subaccion es una fila más de `acciones`
// (mismo modelo, distinta profundidad), Tarea vive en su propia tabla.
const TABLA_POR_TIPO = { Proyecto: 'proyectos', Etapa: 'etapas', Accion: 'acciones', Subaccion: 'acciones', Tarea: 'tareas' };

// Resuelve el id_proyecto de cualquier tipo de entidad. Reemplaza tres
// bloques if/else casi idénticos que existían antes en este archivo (uno
// por endpoint) — el de Tarea faltaba en los tres: como esta función caía
// al branch de "accion" con el id de una TAREA, la consulta a `acciones`
// nunca encontraba la fila y el registro de actividad/recálculo de
// indicadores se saltaba en silencio para cualquier cambio de estado de
// Tarea hecho desde PUT /estado.
async function resolverProyectoId(entidadTipo, entidadId, client) {
  if (entidadTipo === 'Proyecto') return entidadId;
  if (entidadTipo === 'Etapa') {
    const { rows: [e] } = await client.query('SELECT id_proyecto FROM etapas WHERE id = $1', [entidadId]);
    return e?.id_proyecto || null;
  }
  if (entidadTipo === 'Tarea') {
    const { rows: [t] } = await client.query('SELECT id_accion FROM tareas WHERE id = $1', [entidadId]);
    return t ? obtenerProyectoId('accion', t.id_accion, client) : null;
  }
  return obtenerProyectoId('accion', entidadId, client); // Accion / Subaccion
}

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

    // Registrar actividad
    const proyectoId = await resolverProyectoId(entidad_tipo, entidad_id, client);
    if (proyectoId) {
      const { rows: [ent] } = await client.query(
        `SELECT nombre FROM ${TABLA_POR_TIPO[entidad_tipo]} WHERE id = $1`, [entidad_id]
      );
      await registrarActividad({
        id_proyecto: proyectoId,
        id_usuario: idUsuario,
        tipo: 'estado',
        titulo: `${entidad_tipo} "${ent?.nombre || ''}" cambió a ${estado}`,
        descripcion: `Estado anterior: ${resultado.estadoAnterior}`,
        entidad_tipo,
        entidad_id,
        metadata: { estado_anterior: resultado.estadoAnterior, estado_nuevo: resultado.estadoNuevo },
        client
      });
    }

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
 * PUT /api/v1/estado/automatico
 * Body: { entidad_tipo, entidad_id }
 * Apaga estado_override de un contenedor (Etapa, Accion, Subaccion o
 * Proyecto) y recalcula de inmediato su estatus a partir de sus partes.
 */
async function restaurarEstadoAutomatico(req, res) {
  const { entidad_tipo, entidad_id } = req.body;
  const idUsuario = req.usuario?.id;

  if (!entidad_tipo || !entidad_id) {
    return res.status(400).json({
      mensaje: 'Campos requeridos: entidad_tipo, entidad_id'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultado = await restaurarEstadoAutomaticoUtil(entidad_tipo, entidad_id, idUsuario, client);

    // Recalcular indicadores/aportaciones del proyecto afectado, igual que
    // tras cualquier otro cambio de estado.
    const proyectoId = await resolverProyectoId(entidad_tipo, entidad_id, client);
    if (proyectoId) {
      await recalcularIndicadoresProyecto(proyectoId, client);
      await recalcularAportacionesProyecto(proyectoId, client);

      const { rows: [ent] } = await client.query(
        `SELECT nombre FROM ${TABLA_POR_TIPO[entidad_tipo]} WHERE id = $1`, [entidad_id]
      );
      await registrarActividad({
        id_proyecto: proyectoId,
        id_usuario: idUsuario,
        tipo: 'estado',
        titulo: `${entidad_tipo} "${ent?.nombre || ''}" volvió a estatus automático (${resultado.estadoNuevo})`,
        descripcion: `Estado anterior (manual): ${resultado.estadoAnterior}`,
        entidad_tipo,
        entidad_id,
        metadata: { estado_anterior: resultado.estadoAnterior, estado_nuevo: resultado.estadoNuevo },
        client
      });
    }

    await client.query('COMMIT');

    res.json({
      datos: resultado,
      mensaje: `Estatus vuelto a automático: ${resultado.estadoNuevo}`
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

  // Tarea: aditivo puro, antes esta rama no existía — cambiar el estatus
  // de una tarea desde PUT /estado actualizaba `tareas.estado` pero nunca
  // recalculaba la acción/etapa/proyecto padre (calcada de
  // tareas.controller.js:232-243, que sí lo hace bien vía su propio
  // PATCH).
  if (entidadTipo === 'Tarea') {
    const { rows: [tarea] } = await client.query('SELECT id_accion FROM tareas WHERE id = $1', [entidadId]);
    if (!tarea) return;
    await recalcularPadres('accion', tarea.id_accion, client);
    const { rows: [accionPadre] } = await client.query(
      'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [tarea.id_accion]
    );
    if (accionPadre?.id_etapa) await recalcularEtapa(accionPadre.id_etapa, client);
    else if (accionPadre?.id_proyecto) await recalcularProyecto(accionPadre.id_proyecto, client);
  }

  // Recalcular indicadores auto-calculados del proyecto afectado
  const proyectoId = await resolverProyectoId(entidadTipo, entidadId, client);
  if (proyectoId) {
    await recalcularIndicadoresProyecto(proyectoId, client);
    await recalcularAportacionesProyecto(proyectoId, client);
  }
}

module.exports = { cambiarEstado, restaurarEstadoAutomatico, conteoDescendientes };
