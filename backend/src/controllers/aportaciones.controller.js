/**
 * ARCHIVO: aportaciones.controller.js
 * PROPÓSITO: Controlador REST para aportaciones de nodos a indicadores.
 */
const aportacionesQueries = require('../db/queries/aportaciones.queries');
const pool = require('../db/pool');
const { registrarActividad } = require('../utils/actividad-log');

// Resuelve id_proyecto/nombre del indicador dueño de una aportación —
// necesario para la bitácora (actividad_log requiere id_proyecto), ya
// que la fila de indicador_aportaciones no lo trae directo.
async function proyectoDelIndicador(idIndicador) {
  const { rows: [ind] } = await pool.query(
    'SELECT id_proyecto, nombre FROM indicadores WHERE id = $1', [idIndicador]
  );
  return ind || null;
}

const NIVEL_LABEL = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

// "la etapa «X»", a partir de las columnas id_etapa/id_accion/id_tarea de
// una fila de indicador_aportaciones (siempre exactamente una no-nula) —
// para que los 3 eventos de bitácora de este archivo digan de qué nodo se
// trata, no solo el nombre del indicador.
function describirNodoAportacion(fila) {
  const tipo = fila.id_etapa ? 'etapa' : fila.id_tarea ? 'tarea' : fila.id_accion ? 'accion' : null;
  if (!tipo) return null;
  return `${NIVEL_LABEL[tipo]} "${fila.nodo_nombre || 'sin nombre'}"`;
}

// GET /indicadores/:id/aportaciones
async function listar(req, res, next) {
  try {
    const datos = await aportacionesQueries.listarPorIndicador(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /etapas/:id/aportaciones, /acciones/:id/aportaciones o /tareas/:id/aportaciones
async function listarPorNodo(req, res, next) {
  try {
    const tipo = req.originalUrl.includes('/etapas/') ? 'etapa'
      : req.originalUrl.includes('/tareas/') ? 'tarea'
      : 'accion';
    const incluirHijos = req.query.incluirHijos === 'true' || req.query.incluirHijos === '1';
    const datos = await aportacionesQueries.listarPorNodo(tipo, req.params.id, incluirHijos);
    res.json({ datos });
  } catch (err) { next(err); }
}

// POST /indicadores/:id/aportaciones
async function crear(req, res, next) {
  try {
    const { tipo_nodo, id_nodo, valor_aportacion, modo, id_categoria, permitir_cero } = req.body;

    // Un monto vacío/0 antes se aceptaba sin más (`?? 0` solo cubre
    // undefined/null) — ahora hace falta un monto real, salvo que el
    // llamador pida explícitamente permitir_cero (caso legítimo: el
    // checkbox de vincular en Seguimiento crea la aportación en 0 a
    // propósito y deja ajustar el monto justo al lado).
    const monto = valor_aportacion === '' || valor_aportacion == null ? 0 : Number(valor_aportacion);
    if (!permitir_cero && (!Number.isFinite(monto) || monto <= 0)) {
      const err = new Error('Indica cuánto aporta este nodo antes de vincularlo');
      err.statusCode = 400;
      err.codigo = 'MONTO_REQUERIDO';
      throw err;
    }

    await aportacionesQueries.validarCategoriaAportacion(req.params.id, id_categoria || null);
    const datos = {
      id_indicador: req.params.id,
      id_etapa: tipo_nodo === 'etapa' ? id_nodo : null,
      id_accion: tipo_nodo === 'accion' ? id_nodo : null,
      id_tarea: tipo_nodo === 'tarea' ? id_nodo : null,
      id_categoria: id_categoria || null,
      aportacion: monto,
      modo: modo || 'proporcional',
    };
    const aportacion = await aportacionesQueries.crear(datos);
    // Recalcular de inmediato: si el nodo elegido ya estaba Completada (o
    // ya tenía avance, en modo proporcional), sin esto el indicador se
    // queda en 0 hasta el próximo cambio de estado de cualquier otro nodo.
    await aportacionesQueries.recalcularUnIndicador(aportacion.id_indicador);

    const ind = await proyectoDelIndicador(aportacion.id_indicador);
    if (ind) {
      const conNodo = await aportacionesQueries.obtenerConNodo(aportacion.id);
      const nodo = conNodo && describirNodoAportacion(conNodo);
      await registrarActividad({
        id_proyecto: ind.id_proyecto,
        id_usuario: req.usuario?.id || null,
        tipo: 'indicador',
        titulo: `Nodo vinculado a "${ind.nombre}"`,
        descripcion: nodo ? `Se vinculó ${nodo} a este indicador.` : null,
        entidad_tipo: 'Indicador',
        entidad_id: aportacion.id_indicador,
      });
    }

    res.status(201).json({ datos: aportacion, mensaje: 'Aportación creada' });
  } catch (err) {
    if (err.codigo === 'YA_VINCULADO') {
      return res.status(409).json({ error: true, mensaje: err.message, codigo: err.codigo, aportacionExistente: err.aportacionExistente });
    }
    next(err);
  }
}

// PATCH /aportaciones/:id
async function actualizar(req, res, next) {
  try {
    const mapped = {};
    if (req.body.valor_aportacion !== undefined) mapped.aportacion = req.body.valor_aportacion;
    if (req.body.modo !== undefined) mapped.modo = req.body.modo;
    if (req.body.id_categoria !== undefined) {
      const idIndicador = await aportacionesQueries.obtenerIndicadorDeAportacion(req.params.id);
      if (!idIndicador) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
      await aportacionesQueries.validarCategoriaAportacion(idIndicador, req.body.id_categoria || null);
      mapped.id_categoria = req.body.id_categoria || null;
    }
    const aportacion = await aportacionesQueries.actualizar(req.params.id, mapped);
    if (!aportacion) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
    await aportacionesQueries.recalcularUnIndicador(aportacion.id_indicador);

    const ind = await proyectoDelIndicador(aportacion.id_indicador);
    if (ind) {
      const conNodo = await aportacionesQueries.obtenerConNodo(aportacion.id);
      const nodo = conNodo && describirNodoAportacion(conNodo);
      await registrarActividad({
        id_proyecto: ind.id_proyecto,
        id_usuario: req.usuario?.id || null,
        tipo: 'indicador',
        titulo: `Aportación editada en "${ind.nombre}"`,
        descripcion: nodo ? `Se editó la aportación de ${nodo} a este indicador.` : null,
        entidad_tipo: 'Indicador',
        entidad_id: aportacion.id_indicador,
      });
    }

    res.json({ datos: aportacion, mensaje: 'Aportación actualizada' });
  } catch (err) { next(err); }
}

// DELETE /aportaciones/:id
async function eliminar(req, res, next) {
  try {
    // Se resuelve de qué nodo era la aportación (y se prepara el texto del
    // evento) ANTES de borrar la fila — una vez borrada no queda ningún
    // rastro de id_etapa/id_accion/id_tarea, y así nacía el defecto que ya
    // dejó varias entradas sin nodo en la bitácora de producción.
    const antes = await aportacionesQueries.obtenerConNodo(req.params.id);
    if (!antes) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
    const nodo = describirNodoAportacion(antes);
    const ind = await proyectoDelIndicador(antes.id_indicador);

    const resultado = await aportacionesQueries.eliminar(req.params.id);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
    await aportacionesQueries.recalcularUnIndicador(antes.id_indicador);

    if (ind) {
      await registrarActividad({
        id_proyecto: ind.id_proyecto,
        id_usuario: req.usuario?.id || null,
        tipo: 'indicador',
        titulo: `Nodo desvinculado de "${ind.nombre}"`,
        descripcion: nodo ? `${nodo.charAt(0).toUpperCase()}${nodo.slice(1)} dejó de aportar a este indicador.` : null,
        entidad_tipo: 'Indicador',
        entidad_id: antes.id_indicador,
      });
    }

    res.json({ mensaje: 'Aportación eliminada' });
  } catch (err) { next(err); }
}

module.exports = { listar, listarPorNodo, crear, actualizar, eliminar };
