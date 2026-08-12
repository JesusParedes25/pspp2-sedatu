/**
 * ARCHIVO: tareas.controller.js
 * PROPÓSITO: CRUD y PATCH avance/semáforo para tareas (hijas de acciones).
 */
const tareasQueries = require('../db/queries/tareas.queries');
const avanceSemaforo = require('../utils/avance-semaforo');
const { recalcularAportacionesProyecto } = require('../db/queries/aportaciones.queries');
const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');
const { recalcularEtapa, recalcularProyecto } = require('../utils/recalculos');
const actividadQueries = require('../db/queries/actividad.queries');
const municipiosNodoQueries = require('../db/queries/municipios-nodo.queries');
const { puedeGestionarNodo } = require('../utils/autorizacion');

async function listar(req, res, next) {
  try {
    const tareas = await tareasQueries.obtenerTareasPorAccion(req.params.id);
    // avance_efectivo + semaforo_efectivo: mismo criterio que ya usa
    // "Detalle" (obtenerArbol) — cubre el caso "Completada pero
    // avance_actual quedó null", que si no aquí se mostraba 0%.
    for (const tarea of tareas) {
      tarea.avance_efectivo = tarea.avance_actual != null ? tarea.avance_actual : (tarea.estado === 'Completada' ? 100 : 0);
      tarea.semaforo_efectivo = avanceSemaforo.semaforoEfectivo(tarea);
    }
    res.json({ datos: tareas, mensaje: 'Tareas obtenidas' });
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const datos = { ...req.body, id_accion: req.params.id };
    const tarea = await tareasQueries.crearTarea(datos);

    // Recalcular acción padre → etapa → proyecto: una tarea nueva cambia el
    // avance/estado agregado de su acción contenedora (mismo patrón que ya
    // usa patchAvanceSemaforo más abajo — antes de esto, la acción se
    // quedaba con su valor viejo hasta el siguiente cambio de avance).
    await avanceSemaforo.recalcularPadres('accion', tarea.id_accion);
    const pool = require('../db/pool');
    const { rows: [accionPadre] } = await pool.query(
      'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [tarea.id_accion]
    );
    if (accionPadre?.id_etapa) {
      await recalcularEtapa(accionPadre.id_etapa);
    } else if (accionPadre?.id_proyecto) {
      await recalcularProyecto(accionPadre.id_proyecto);
    }

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
    // DELETE /etapas/:id y DELETE /acciones/:id ya validaban esto; aquí
    // faltaba, así que cualquier usuario autenticado podía borrar una tarea
    // de un proyecto ajeno con una llamada directa a la API.
    const permitido = await puedeGestionarNodo({ usuario: req.usuario, tipoNodo: 'tarea', idNodo: req.params.id });
    if (!permitido) {
      return res.status(403).json({
        error: true,
        mensaje: 'No tienes permisos para eliminar esta tarea',
        codigo: 'FORBIDDEN'
      });
    }

    const tarea = await tareasQueries.eliminarTarea(req.params.id);
    if (!tarea) return res.status(404).json({ error: true, mensaje: 'Tarea no encontrada' });

    // Recalcular acción padre → etapa → proyecto: una tarea eliminada
    // también cambia el avance/estado agregado de su acción contenedora
    // (mismo patrón que crear() arriba y patchAvanceSemaforo más abajo).
    await avanceSemaforo.recalcularPadres('accion', tarea.id_accion);
    const pool = require('../db/pool');
    const { rows: [accionPadre] } = await pool.query(
      'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [tarea.id_accion]
    );
    if (accionPadre?.id_etapa) {
      await recalcularEtapa(accionPadre.id_etapa);
    } else if (accionPadre?.id_proyecto) {
      await recalcularProyecto(accionPadre.id_proyecto);
    }

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

    const { avance_actual, semaforo, estado, prioridad, fecha_inicio, fecha_limite, nombre, descripcion, estatus_cualitativo, cve_ent, municipios } = req.body;
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
    if (fecha_inicio !== undefined) { sets.push(`fecha_inicio = $${idx}`); params.push(fecha_inicio || null); idx++; }
    if (fecha_limite !== undefined) { sets.push(`fecha_limite = $${idx}`); params.push(fecha_limite); idx++; }
    if (nombre !== undefined) { sets.push(`nombre = $${idx}`); params.push(nombre); idx++; }
    if (descripcion !== undefined) { sets.push(`descripcion = $${idx}`); params.push(descripcion); idx++; }
    if (estatus_cualitativo !== undefined) {
      sets.push(`estatus_cualitativo = $${idx}`); params.push(estatus_cualitativo || null); idx++;
      sets.push('estatus_cualitativo_fecha = NOW()');
    }
    if (cve_ent !== undefined) { sets.push(`cve_ent = $${idx}`); params.push(cve_ent || null); idx++; }

    // Municipios (relación N:N) — reemplaza el conjunto completo si se
    // proporciona. Pueden pertenecer a distintos estados; cve_ent ya no
    // los limita a un solo estado, es solo el estado "principal" opcional.
    if (municipios !== undefined) {
      const lista = Array.isArray(municipios) ? [...new Set(municipios.filter(Boolean))] : [];
      await municipiosNodoQueries.reemplazarMunicipiosTarea(client, req.params.id, lista);
    } else if (cve_ent !== undefined && !cve_ent) {
      await municipiosNodoQueries.reemplazarMunicipiosTarea(client, req.params.id, []);
    }

    if (sets.length === 0 && municipios === undefined) {
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

    // Stream de actividad: registrar cambios de estatus/avance (misma transacción)
    if (estado !== undefined) {
      await actividadQueries.crearActividad({
        tipoNodo: 'tarea', idNodo: req.params.id, tipoEvento: 'cambio_estatus',
        idUsuario: req.usuario?.id, contenido: `Estatus cambiado a ${estado}`,
        metadata: { estado },
      }, client);
    }
    if (avance_actual !== undefined) {
      await actividadQueries.crearActividad({
        tipoNodo: 'tarea', idNodo: req.params.id, tipoEvento: 'cambio_avance',
        idUsuario: req.usuario?.id, contenido: `Avance actualizado a ${avance_actual ?? 0}%`,
        metadata: { avance_actual },
      }, client);
    }
    if (estatus_cualitativo !== undefined) {
      await actividadQueries.crearActividad({
        tipoNodo: 'tarea', idNodo: req.params.id, tipoEvento: 'estatus_cualitativo',
        idUsuario: req.usuario?.id, contenido: estatus_cualitativo,
        metadata: { estatus_cualitativo },
      }, client);
    }

    await client.query('COMMIT');
    client.release();

    res.json({ datos: updated, mensaje: 'Tarea actualizada' });
  } catch (err) { next(err); }
}

module.exports = { listar, crear, actualizar, eliminar, patchAvanceSemaforo };
