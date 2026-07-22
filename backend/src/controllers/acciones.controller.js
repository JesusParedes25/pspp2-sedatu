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
const pool = require('../db/pool');
const { cambiarEstado: cambiarEstadoUtil, tipoRealAccion, verificarAutoCompletarPadre } = require('../utils/validaciones-estado');
const { recalcularEtapa, recalcularProyecto } = require('../utils/recalculos');
const avanceSemaforo = require('../utils/avance-semaforo');
const { recalcularAportacionesProyecto } = require('../db/queries/aportaciones.queries');
const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');

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
// Si el body incluye 'estado', delega al módulo compartido validaciones-estado.
// Los demás campos (nombre, descripcion, porcentaje, fechas) se actualizan vía query.
async function actualizar(req, res, next) {
  const { estado, motivo_bloqueo, nota_resolucion, ...otrosDatos } = req.body;
  const idUsuario = req.usuario.id;
  const accionId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Si hay cambio de estado, usar módulo compartido
    if (estado) {
      const fila = await client.query('SELECT * FROM acciones WHERE id = $1', [accionId]);
      if (!fila.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: true, mensaje: 'Acción no encontrada' });
      }
      const entidadTipo = tipoRealAccion(fila.rows[0]);

      // Auto-completar porcentaje si se marca Completada
      if (estado === 'Completada' && otrosDatos.porcentaje_avance === undefined) {
        otrosDatos.porcentaje_avance = 100;
      }

      await cambiarEstadoUtil(
        entidadTipo, accionId, estado,
        { motivoBloqueo: motivo_bloqueo, notaResolucion: nota_resolucion, idUsuario },
        client
      );

      // Auto-completar padre si todos los hijos están terminados
      if (['Completada', 'Cancelada'].includes(estado)) {
        await verificarAutoCompletarPadre(entidadTipo, accionId, idUsuario, client);
      }
    }

    // Actualizar campos no-estado si hay alguno
    const accion = await accionesQueries.actualizarAccionCampos(accionId, otrosDatos, client);

    // Recalcular cascada
    const fila = accion || (await client.query('SELECT * FROM acciones WHERE id = $1', [accionId])).rows[0];
    if (fila?.id_etapa) await recalcularEtapa(fila.id_etapa, client);
    else if (fila?.id_proyecto) await recalcularProyecto(fila.id_proyecto, client);

    // Si es subacción, recalcular porcentaje del padre
    if (fila?.id_accion_padre) {
      await accionesQueries.recalcularAccionDesdeSubs(fila.id_accion_padre, client);
    }

    await client.query('COMMIT');

    // Retornar acción actualizada
    const actualizada = await accionesQueries.obtenerAccionPorId(accionId);
    res.json({ datos: actualizada, mensaje: 'Acción actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.statusCode || (err.message.includes('evidencia') ? 400 : 500);
    if (status < 500) {
      return res.status(status).json({ error: true, mensaje: err.message, codigo: 'VALIDACION_NEGOCIO' });
    }
    next(err);
  } finally {
    client.release();
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

// GET /agenda — Obtener todas las actividades con fecha del usuario para la agenda
async function agenda(req, res, next) {
  try {
    const items = await accionesQueries.obtenerAccionesAgenda(req.usuario.id);
    res.json({ datos: items, mensaje: 'Agenda obtenida' });
  } catch (err) {
    next(err);
  }
}

// PUT /acciones/:id/indicadores — Reemplazar aportaciones a indicadores
async function actualizarIndicadores(req, res, next) {
  try {
    await accionesQueries.actualizarIndicadoresAccion(req.params.id, req.body.indicadores_asociados || []);
    res.json({ mensaje: 'Indicadores actualizados' });
  } catch (err) {
    if (err.message.includes('excede') || err.message.includes('negativo')) {
      return res.status(400).json({ error: true, mensaje: err.message, codigo: 'VALIDACION_NEGOCIO' });
    }
    next(err);
  }
}

// GET /acciones/:id/indicadores — Obtener indicadores vinculados
async function obtenerIndicadores(req, res, next) {
  try {
    const datos = await accionesQueries.obtenerIndicadoresAccion(req.params.id);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// PATCH /acciones/:id/campo — Actualizar un solo campo (para inline editing en DataGrid)
async function patchCampo(req, res, next) {
  try {
    const { campo, valor } = req.body;
    if (!campo) return res.status(400).json({ error: true, mensaje: 'Se requiere "campo"' });

    const accion = await accionesQueries.patchCampoAccion(req.params.id, campo, valor);
    if (!accion) {
      return res.status(404).json({ error: true, mensaje: 'Acción no encontrada', codigo: 'NO_ENCONTRADO' });
    }

    res.json({ datos: accion, mensaje: `Campo "${campo}" actualizado` });
  } catch (err) {
    if (err.message?.startsWith('Campo no permitido')) {
      return res.status(400).json({ error: true, mensaje: err.message });
    }
    next(err);
  }
}

// PATCH /acciones/:id — Actualizar avance/semáforo/estatus/prioridad/fecha_limite
async function patchAvanceSemaforo(req, res, next) {
  const accionId = req.params.id;
  const { avance_actual, semaforo, estado, prioridad, fecha_limite, fecha_inicio,
          escala_territorial, instrumento, cve_ent, cve_mun, id_zm, tipo, id_responsable, nombre, descripcion, observaciones } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM acciones WHERE id = $1', [accionId]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, mensaje: 'Acción no encontrada' });
    }
    const accion = rows[0];
    const esHoja = await avanceSemaforo.esNodoHoja(accionId, client);

    // ── Contenedor: rechazar avance y estado ──
    if (!esHoja) {
      if (avance_actual !== undefined) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: true,
          mensaje: 'El avance de un contenedor se calcula automáticamente a partir de sus partes.'
        });
      }
      if (estado !== undefined) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: true,
          mensaje: 'El estatus de un contenedor se calcula automáticamente a partir de sus partes.'
        });
      }
    }

    const sets = [];
    const params = [];
    let idx = 1;

    // ── Estado (solo hojas) ──
    if (estado !== undefined && esHoja) {
      sets.push(`estado = $${idx}`);
      params.push(estado); idx++;
      // Completada → avance = 100
      if (estado === 'Completada') {
        sets.push(`avance_actual = 100, avance_override = TRUE, porcentaje_avance = 100`);
      }
      // Pendiente → avance = 0
      if (estado === 'Pendiente') {
        sets.push(`avance_actual = 0, avance_override = TRUE, porcentaje_avance = 0`);
      }
    }

    // ── Avance actual (solo hojas) ──
    if (avance_actual !== undefined && esHoja) {
      // Determinar estado efectivo (puede venir en el mismo request)
      const estadoEfectivo = estado || accion.estado;
      if (estadoEfectivo === 'Completada') {
        // Ignorar: avance fijo en 100
      } else if (estadoEfectivo === 'Pendiente') {
        // Ignorar: avance fijo en 0
      } else if (estadoEfectivo === 'Bloqueada') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: true, mensaje: 'No se puede modificar el avance de un nodo bloqueado.' });
      } else if (estadoEfectivo === 'Cancelada') {
        // Ignorar
      } else {
        // En_proceso: editable 0-99
        if (avance_actual === null) {
          sets.push(`avance_actual = NULL, avance_override = FALSE`);
        } else {
          const v = parseInt(avance_actual);
          if (isNaN(v) || v < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: true, mensaje: 'avance_actual debe ser entre 0 y 99. Para llegar a 100 marca como Completada.' });
          }
          if (v >= 100) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: true, mensaje: 'Para llegar al 100% marca el nodo como Completada.' });
          }
          sets.push(`avance_actual = $${idx}, avance_override = TRUE, porcentaje_avance = $${idx + 1}`);
          params.push(v); idx++;
          params.push(v); idx++;
        }
      }
    }

    // Semáforo
    if (semaforo !== undefined) {
      if (semaforo === null) {
        sets.push(`semaforo = NULL, semaforo_override = FALSE`);
      } else {
        if (!['verde', 'ambar', 'rojo', 'gris'].includes(semaforo)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: true, mensaje: 'semaforo debe ser verde, ambar, rojo o gris' });
        }
        sets.push(`semaforo = $${idx}, semaforo_override = TRUE`);
        params.push(semaforo); idx++;
      }
    }

    // Prioridad
    if (prioridad !== undefined) {
      sets.push(`prioridad = $${idx}`);
      params.push(prioridad); idx++;
    }

    // Fecha límite
    if (fecha_limite !== undefined) {
      sets.push(`fecha_limite = $${idx}`);
      params.push(fecha_limite || null); idx++;
    }
    if (fecha_inicio !== undefined) {
      sets.push(`fecha_inicio = $${idx}`);
      params.push(fecha_inicio || null); idx++;
    }
    // Campos de catálogo
    if (escala_territorial !== undefined) { sets.push(`escala_territorial = $${idx}`); params.push(escala_territorial || null); idx++; }
    if (instrumento !== undefined) { sets.push(`instrumento = $${idx}`); params.push(instrumento || null); idx++; }
    if (cve_ent !== undefined) { sets.push(`cve_ent = $${idx}`); params.push(cve_ent || null); idx++; }
    if (cve_mun !== undefined) { sets.push(`cve_mun = $${idx}`); params.push(cve_mun || null); idx++; }
    if (id_zm !== undefined) { sets.push(`id_zm = $${idx}`); params.push(id_zm || null); idx++; }
    if (tipo !== undefined) { sets.push(`tipo = $${idx}`); params.push(tipo || null); idx++; }
    if (id_responsable !== undefined) { sets.push(`id_responsable = $${idx}`); params.push(id_responsable || null); idx++; }
    if (nombre !== undefined) { sets.push(`nombre = $${idx}`); params.push(nombre); idx++; }
    if (descripcion !== undefined) { sets.push(`descripcion = $${idx}`); params.push(descripcion); idx++; }
    if (observaciones !== undefined) { sets.push(`observaciones = $${idx}`); params.push(observaciones || null); idx++; }

    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      params.push(accionId); idx++;
      await client.query(`UPDATE acciones SET ${sets.join(', ')} WHERE id = $${idx - 1}`, params);
    }

    // Recalcular padres (avance + estado derivado en contenedores)
    await avanceSemaforo.recalcularPadres('accion', accionId, client);

    // Recalcular etapa y proyecto
    if (accion.id_etapa) {
      await recalcularEtapa(accion.id_etapa, client);
    } else if (accion.id_proyecto) {
      await recalcularProyecto(accion.id_proyecto, client);
    }

    // ── PART 2: Recalcular indicadores afectados ──
    const proyectoId = await avanceSemaforo.obtenerProyectoId('accion', accionId, client);
    if (proyectoId) {
      await recalcularIndicadoresProyecto(proyectoId, client);
      await recalcularAportacionesProyecto(proyectoId, client);
    }

    await client.query('COMMIT');

    const actualizada = await accionesQueries.obtenerAccionPorId(accionId);
    if (actualizada) {
      actualizada.avance_efectivo = await avanceSemaforo.calcularAvanceEfectivoAccion(actualizada, pool);
      actualizada.semaforo_efectivo = avanceSemaforo.semaforoEfectivo(actualizada);
      actualizada.es_hoja = await avanceSemaforo.esNodoHoja(accionId, pool);
    }
    res.json({ datos: actualizada, mensaje: 'Acción actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
  actualizar,
  eliminar,
  agenda,
  importarCSV,
  actualizarIndicadores,
  obtenerIndicadores,
  patchCampo,
  patchAvanceSemaforo
};
