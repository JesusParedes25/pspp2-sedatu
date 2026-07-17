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
const avanceSemaforo = require('../utils/avance-semaforo');
const { recalcularAportacionesProyecto } = require('../db/queries/aportaciones.queries');
const { recalcularIndicadoresProyecto } = require('../db/queries/indicadores.queries');

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

// PATCH /etapas/:id/campo — Actualizar un solo campo (para inline editing en DataGrid)
async function patchCampo(req, res, next) {
  try {
    const { campo, valor } = req.body;
    if (!campo) return res.status(400).json({ error: true, mensaje: 'Se requiere "campo"' });

    const etapa = await etapasQueries.patchCampoEtapa(req.params.id, campo, valor);
    if (!etapa) {
      return res.status(404).json({ error: true, mensaje: 'Etapa no encontrada', codigo: 'NO_ENCONTRADO' });
    }

    res.json({ datos: etapa, mensaje: `Campo "${campo}" actualizado` });
  } catch (err) {
    if (err.message?.startsWith('Campo no permitido')) {
      return res.status(400).json({ error: true, mensaje: err.message });
    }
    next(err);
  }
}

// GET /proyectos/:id/campos-extra-schema — Claves únicas de campos_extra del proyecto
async function obtenerCamposExtraSchema(req, res, next) {
  try {
    const claves = await etapasQueries.obtenerCamposExtraSchema(req.params.id);
    res.json({ datos: claves, mensaje: 'Schema de campos extra obtenido' });
  } catch (err) {
    next(err);
  }
}

// PATCH /etapas/:id — Actualizar avance/semáforo/estatus/prioridad/fecha_limite
async function patchAvanceSemaforo(req, res, next) {
  const etapaId = req.params.id;
  const { avance_actual, semaforo, estado, prioridad, fecha_limite, fecha_inicio,
          escala_territorial, instrumento, cve_ent, cve_mun, id_zm, tipo, id_responsable,
          nombre, descripcion } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM etapas WHERE id = $1', [etapaId]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, mensaje: 'Etapa no encontrada' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    // ── Contenedor check ──
    const esHoja = await avanceSemaforo.esEtapaHoja(etapaId, client);

    // Avance actual: rechazar si contenedor
    if (avance_actual !== undefined) {
      if (!esHoja) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: true,
          mensaje: 'El avance de un contenedor se calcula automáticamente a partir de sus partes.'
        });
      }
      // Etapa hoja: aplicar reglas de hoja
      const estadoEfectivo = estado || rows[0].estado;
      if (estadoEfectivo === 'Completada' || estadoEfectivo === 'Pendiente' || estadoEfectivo === 'Cancelada') {
        // Ignorar: avance fijo según estado
      } else if (estadoEfectivo === 'Bloqueada') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: true, mensaje: 'No se puede modificar el avance de un nodo bloqueado.' });
      } else if (avance_actual === null) {
        sets.push(`avance_actual = NULL, avance_override = FALSE`);
      } else {
        const v = parseInt(avance_actual);
        if (isNaN(v) || v < 0 || v >= 100) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: true, mensaje: 'avance_actual debe ser entre 0 y 99. Para llegar a 100 marca como Completada.' });
        }
        sets.push(`avance_actual = $${idx}, avance_override = TRUE`);
        params.push(v); idx++;
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

    // Estado: rechazar si contenedor
    if (estado !== undefined) {
      if (!esHoja) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: true,
          mensaje: 'El estatus de un contenedor se calcula automáticamente a partir de sus partes.'
        });
      }
      sets.push(`estado = $${idx}`);
      params.push(estado); idx++;
      if (estado === 'Completada') {
        sets.push(`avance_actual = 100, avance_override = TRUE, porcentaje_calculado = 100`);
      }
      if (estado === 'Pendiente') {
        sets.push(`avance_actual = 0, avance_override = TRUE, porcentaje_calculado = 0`);
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
    if (escala_territorial !== undefined) {
      sets.push(`escala_territorial = $${idx}`);
      params.push(escala_territorial || null); idx++;
    }
    if (instrumento !== undefined) {
      sets.push(`instrumento = $${idx}`);
      params.push(instrumento || null); idx++;
    }
    if (cve_ent !== undefined) {
      sets.push(`cve_ent = $${idx}`);
      params.push(cve_ent || null); idx++;
    }
    if (cve_mun !== undefined) {
      sets.push(`cve_mun = $${idx}`);
      params.push(cve_mun || null); idx++;
    }
    if (id_zm !== undefined) {
      sets.push(`id_zm = $${idx}`);
      params.push(id_zm || null); idx++;
    }
    if (tipo !== undefined) {
      sets.push(`tipo = $${idx}`);
      params.push(tipo || null); idx++;
    }
    if (id_responsable !== undefined) {
      sets.push(`id_responsable = $${idx}`);
      params.push(id_responsable || null); idx++;
    }
    if (nombre !== undefined) {
      sets.push(`nombre = $${idx}`);
      params.push(nombre); idx++;
    }
    if (descripcion !== undefined) {
      sets.push(`descripcion = $${idx}`);
      params.push(descripcion); idx++;
    }

    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      params.push(etapaId); idx++;
      await client.query(`UPDATE etapas SET ${sets.join(', ')} WHERE id = $${idx - 1}`, params);
    }

    // Recalcular proyecto
    if (rows[0].id_proyecto) {
      const avanceEtapa = await avanceSemaforo.calcularAvanceEfectivo('etapa', etapaId, client);
      await client.query('UPDATE etapas SET porcentaje_calculado = $1 WHERE id = $2', [avanceEtapa, etapaId]);
      await recalcularProyecto(rows[0].id_proyecto, client);

      // ── PART 2: Recalcular indicadores ──
      await recalcularIndicadoresProyecto(rows[0].id_proyecto, client);
      await recalcularAportacionesProyecto(rows[0].id_proyecto, client);
    }

    await client.query('COMMIT');

    // Devolver sub-árbol
    const subarbol = await avanceSemaforo.obtenerSubarbol(etapaId);
    res.json({ datos: subarbol, mensaje: 'Etapa actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// GET /proyectos/:id/arbol — Árbol completo con avances y semáforos calculados
async function obtenerArbol(req, res, next) {
  try {
    const proyectoId = req.params.id;
    const etapas = await etapasQueries.obtenerEtapasPorProyecto(proyectoId, req.query.id_dg || null);

    const tareasQueries = require('../db/queries/tareas.queries');
    const arbol = [];
    for (const etapa of etapas) {
      const nodo = await avanceSemaforo.obtenerSubarbol(etapa.id);
      if (nodo) {
        // Agregar tareas a cada acción
        for (const acc of (nodo.acciones || [])) {
          acc.tareas = await tareasQueries.obtenerTareasPorAccion(acc.id);
          // También tareas para subacciones
          for (const sub of (acc.subacciones || [])) {
            sub.tareas = await tareasQueries.obtenerTareasPorAccion(sub.id);
          }
        }
        arbol.push(nodo);
      }
    }

    res.json({ datos: arbol, mensaje: 'Árbol obtenido' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listarPorProyecto, obtenerPorId, crear, actualizar, eliminar, patchCampo, obtenerCamposExtraSchema, patchAvanceSemaforo, obtenerArbol };
