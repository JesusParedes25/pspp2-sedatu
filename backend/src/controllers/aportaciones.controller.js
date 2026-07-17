/**
 * ARCHIVO: aportaciones.controller.js
 * PROPÓSITO: Controlador REST para aportaciones de nodos a indicadores.
 */
const aportacionesQueries = require('../db/queries/aportaciones.queries');

// GET /indicadores/:id/aportaciones
async function listar(req, res, next) {
  try {
    const datos = await aportacionesQueries.listarPorIndicador(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /etapas/:id/aportaciones o /acciones/:id/aportaciones
async function listarPorNodo(req, res, next) {
  try {
    const tipo = req.originalUrl.includes('/etapas/') ? 'etapa' : 'accion';
    const datos = await aportacionesQueries.listarPorNodo(tipo, req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// POST /indicadores/:id/aportaciones
async function crear(req, res, next) {
  try {
    const { tipo_nodo, id_nodo, valor_aportacion, modo } = req.body;
    const datos = {
      id_indicador: req.params.id,
      id_etapa: tipo_nodo === 'etapa' ? id_nodo : null,
      id_accion: tipo_nodo === 'accion' ? id_nodo : null,
      aportacion: valor_aportacion ?? 0,
      modo: modo || 'proporcional',
    };
    const aportacion = await aportacionesQueries.crear(datos);
    res.status(201).json({ datos: aportacion, mensaje: 'Aportación creada' });
  } catch (err) { next(err); }
}

// PATCH /aportaciones/:id
async function actualizar(req, res, next) {
  try {
    const mapped = {};
    if (req.body.valor_aportacion !== undefined) mapped.aportacion = req.body.valor_aportacion;
    if (req.body.modo !== undefined) mapped.modo = req.body.modo;
    const aportacion = await aportacionesQueries.actualizar(req.params.id, mapped);
    if (!aportacion) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
    res.json({ datos: aportacion, mensaje: 'Aportación actualizada' });
  } catch (err) { next(err); }
}

// DELETE /aportaciones/:id
async function eliminar(req, res, next) {
  try {
    const resultado = await aportacionesQueries.eliminar(req.params.id);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'Aportación no encontrada' });
    res.json({ mensaje: 'Aportación eliminada' });
  } catch (err) { next(err); }
}

module.exports = { listar, listarPorNodo, crear, actualizar, eliminar };
