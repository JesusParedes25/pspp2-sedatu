/**
 * ARCHIVO: tareas.controller.js
 * PROPÓSITO: CRUD y PATCH avance/semáforo para tareas (hijas de acciones).
 */
const tareasQueries = require('../db/queries/tareas.queries');
const avanceSemaforo = require('../utils/avance-semaforo');
const { recalcularAportacionesProyecto } = require('../db/queries/aportaciones.queries');
const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');
const { recalcularEtapa, recalcularProyecto } = require('../utils/recalculos');

async function listar(req, res, next) {
  try {
    const tareas = await tareasQueries.obtenerTareasPorAccion(req.params.id);
    res.json({ datos: tareas, mensaje: 'Tareas obtenidas' });
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const datos = { ...req.body, id_accion: req.params.id };
    const tarea = await tareasQueries.crearTarea(datos);
    res.status(201).json({ datos: tarea, mensaje: 'Tarea creada' });
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const tarea = await tareasQueries.actualizarTarea(req.params.id, req.body);
    if (!tarea) return res.status(404).json({ error: true, mensaje: 'Tarea no encontrada' });
    res.json({ datos: tarea, mensaje: 'Tarea actualizada' });
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const tarea = await tareasQueries.eliminarTarea(req.params.id);
    if (!tarea) return res.status(404).json({ error: true, mensaje: 'Tarea no encontrada' });
    res.json({ datos: { id: tarea.id }, mensaje: 'Tarea eliminada' });
  } catch (err) { next(err); }
}

async function patchAvanceSemaforo(req, res, next) {
  try {
    const pool = require('../db/pool');
    const client = await pool.connect();
    await client.query('BEGIN');

    const { rows: [tarea] } = await client.query('SELECT * FROM tareas WHERE id = $1', [req.params.id]);
    if (!tarea) {
      await client.query('ROLLBACK'); client.release();
      return res.status(404).json({ error: true, mensaje: 'Tarea no encontrada' });
    }

    const { avance_actual, semaforo, estado, prioridad, fecha_limite, nombre, descripcion } = req.body;
    const sets = []; const params = []; let idx = 1;

    // ── Estado (tareas siempre son hojas) ──
    if (estado !== undefined) {
      sets.push(`estado = $${idx}`); params.push(estado); idx++;
      if (estado === 'Completada') {
        sets.push('avance_actual = 100, avance_override = TRUE');
      }
      if (estado === 'Pendiente') {
        sets.push('avance_actual = 0, avance_override = TRUE');
      }
    }

    // ── Avance actual (solo en En_proceso, rango 0-99) ──
    if (avance_actual !== undefined) {
      const estadoEfectivo = estado || tarea.estado;
      if (estadoEfectivo === 'Completada' || estadoEfectivo === 'Pendiente' || estadoEfectivo === 'Cancelada') {
        // Ignorar: avance fijo según estado
      } else if (estadoEfectivo === 'Bloqueada') {
        await client.query('ROLLBACK'); client.release();
        return res.status(400).json({ error: true, mensaje: 'No se puede modificar el avance de un nodo bloqueado.' });
      } else if (avance_actual === null) {
        sets.push('avance_actual = NULL, avance_override = FALSE');
      } else {
        const v = parseInt(avance_actual);
        if (isNaN(v) || v < 0) {
          await client.query('ROLLBACK'); client.release();
          return res.status(400).json({ error: true, mensaje: 'avance_actual debe ser entre 0 y 99.' });
        }
        if (v >= 100) {
          await client.query('ROLLBACK'); client.release();
          return res.status(400).json({ error: true, mensaje: 'Para llegar al 100% marca el nodo como Completada.' });
        }
        sets.push(`avance_actual = $${idx}, avance_override = TRUE`);
        params.push(v); idx++;
      }
    }

    if (semaforo !== undefined) {
      if (semaforo === null) {
        sets.push('semaforo = NULL, semaforo_override = FALSE');
      } else {
        if (!['verde', 'ambar', 'rojo', 'gris'].includes(semaforo)) {
          await client.query('ROLLBACK'); client.release();
          return res.status(400).json({ error: true, mensaje: 'Valor de semáforo inválido' });
        }
        sets.push(`semaforo = $${idx}, semaforo_override = TRUE`);
        params.push(semaforo); idx++;
      }
    }
    if (prioridad !== undefined) { sets.push(`prioridad = $${idx}`); params.push(prioridad); idx++; }
    if (fecha_limite !== undefined) { sets.push(`fecha_limite = $${idx}`); params.push(fecha_limite); idx++; }
    if (nombre !== undefined) { sets.push(`nombre = $${idx}`); params.push(nombre); idx++; }
    if (descripcion !== undefined) { sets.push(`descripcion = $${idx}`); params.push(descripcion); idx++; }

    if (sets.length === 0) {
      await client.query('ROLLBACK'); client.release();
      return res.status(400).json({ error: true, mensaje: 'No se proporcionaron campos para actualizar' });
    }

    sets.push('updated_at = NOW()');
    params.push(req.params.id); idx++;
    const sql = `UPDATE tareas SET ${sets.join(', ')} WHERE id = $${idx - 1} RETURNING *`;
    const { rows: [updated] } = await client.query(sql, params);

    // Recalcular padre (acción): avance + estado derivado
    await avanceSemaforo.recalcularPadres('accion', tarea.id_accion, client);

    // Recalcular etapa y proyecto
    const { rows: [accionPadre] } = await client.query(
      'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [tarea.id_accion]
    );
    if (accionPadre?.id_etapa) {
      await recalcularEtapa(accionPadre.id_etapa, client);
    } else if (accionPadre?.id_proyecto) {
      await recalcularProyecto(accionPadre.id_proyecto, client);
    }

    // ── PART 2: Recalcular indicadores ──
    const proyectoId = await avanceSemaforo.obtenerProyectoId('accion', tarea.id_accion, client);
    if (proyectoId) {
      await recalcularIndicadoresProyecto(proyectoId, client);
      await recalcularAportacionesProyecto(proyectoId, client);
    }

    await client.query('COMMIT');
    client.release();

    res.json({ datos: updated, mensaje: 'Tarea actualizada' });
  } catch (err) { next(err); }
}

module.exports = { listar, crear, actualizar, eliminar, patchAvanceSemaforo };
