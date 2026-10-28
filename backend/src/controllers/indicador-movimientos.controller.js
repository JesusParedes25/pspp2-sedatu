/**
 * ARCHIVO: indicador-movimientos.controller.js
 * PROPÓSITO: Captura manual y anulación de movimientos de un indicador
 *            (historial de solo inserción, migración 084). Reemplaza al
 *            viejo PATCH /indicadores/:id/valor (captura directa que
 *            pisaba valor_actual) — ahora toda captura, automática o a
 *            mano, pasa por esta tabla.
 */
const movimientosQueries = require('../db/queries/indicador-movimientos.queries');
const indicadoresQueries = require('../db/queries/indicadores.queries');
const { registrarActividad } = require('../utils/actividad-log');

// GET /indicadores/:id/movimientos — historial completo para la pantalla
// de detalle (Bloque 6 del encargo).
async function listar(req, res, next) {
  try {
    const datos = await movimientosQueries.listarPorIndicador(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// POST /indicadores/:id/movimientos — captura a mano. Body: { cantidad,
// fecha?, nota?, id_nodo_origen? }. `fecha` por defecto hoy; se acepta
// explícita para registrar algo capturado tarde con su fecha real.
// `id_nodo_origen` es opcional: cuando se registra desde la pestaña
// Indicadores de un nodo en Seguimiento > Detalle (Bloque 4), viaja el
// nodo para que el historial diga de dónde vino ("Registro a mano de
// <nodo>") en vez de verse como una captura suelta a nivel indicador.
async function crear(req, res, next) {
  try {
    const { cantidad, fecha, nota, id_nodo_origen } = req.body;
    const num = parseFloat(cantidad);
    if (!Number.isFinite(num) || num === 0) {
      return res.status(400).json({ error: true, mensaje: 'Indica una cantidad distinta de cero', codigo: 'CANTIDAD_REQUERIDA' });
    }
    const indicador = await indicadoresQueries.obtenerPorId(req.params.id);
    if (!indicador) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    const movimiento = await movimientosQueries.crear({
      idIndicador: req.params.id,
      cantidad: num,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      origen: 'manual',
      idNodoOrigen: id_nodo_origen || null,
      nota: nota || null,
      creadoPor: req.usuario?.id,
    });
    await registrarActividad({
      id_proyecto: indicador.id_proyecto,
      id_usuario: req.usuario?.id || null,
      tipo: 'indicador',
      titulo: `Valor capturado a mano para "${indicador.nombre}"`,
      descripcion: nota || null,
      entidad_tipo: 'Indicador',
      entidad_id: req.params.id,
    });
    res.status(201).json({ datos: movimiento, mensaje: 'Movimiento registrado' });
  } catch (err) { next(err); }
}

// PATCH /movimientos/:id/anular — no borra, deja el renglón visible
// tachado (ver indicador-movimientos.queries.js::anular).
async function anular(req, res, next) {
  try {
    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: true, mensaje: 'Indica el motivo de la anulación', codigo: 'MOTIVO_REQUERIDO' });
    }
    const movimiento = await movimientosQueries.anular(req.params.id, { motivo, usuarioId: req.usuario?.id });
    if (!movimiento) {
      return res.status(404).json({ error: true, mensaje: 'Movimiento no encontrado o ya estaba anulado' });
    }
    const indicador = await indicadoresQueries.obtenerPorId(movimiento.id_indicador);
    if (indicador) {
      await registrarActividad({
        id_proyecto: indicador.id_proyecto,
        id_usuario: req.usuario?.id || null,
        tipo: 'indicador',
        titulo: `Movimiento anulado en "${indicador.nombre}"`,
        descripcion: motivo,
        entidad_tipo: 'Indicador',
        entidad_id: movimiento.id_indicador,
      });
    }
    res.json({ datos: movimiento, mensaje: 'Movimiento anulado' });
  } catch (err) { next(err); }
}

module.exports = { listar, crear, anular };
