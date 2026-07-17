/**
 * ARCHIVO: catalogos.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de catálogos del sistema.
 *
 * MINI-CLASE: Catálogos como endpoints de solo lectura
 * ─────────────────────────────────────────────────────────────────
 * Los catálogos son datos de referencia que el frontend necesita
 * para poblar selects, filtros y autocompletados. Son endpoints
 * GET de solo lectura que devuelven listas completas (no paginadas)
 * porque los catálogos de SEDATU son pequeños (19 DGs, ~50 usuarios,
 * ~5 programas). El frontend los cachea al cargar la app para evitar
 * peticiones repetitivas.
 * ─────────────────────────────────────────────────────────────────
 */
const catalogosQueries = require('../db/queries/catalogos.queries');
const pool = require('../db/pool');

// GET /catalogos/dgs — Lista todas las DGs
async function obtenerDGs(req, res, next) {
  try {
    const dgs = await catalogosQueries.obtenerDGs();
    res.json({ datos: dgs, mensaje: 'DGs obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/usuarios — Lista usuarios con filtros opcionales
async function obtenerUsuarios(req, res, next) {
  try {
    const { id_dg, id_direccion_area, nombre, excluir_proyecto } = req.query;
    const usuarios = await catalogosQueries.obtenerUsuarios(id_dg, { id_direccion_area, nombre, excluir_proyecto });
    res.json({ datos: usuarios, mensaje: 'Usuarios obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/programas — Lista programas activos
async function obtenerProgramas(req, res, next) {
  try {
    const programas = await catalogosQueries.obtenerProgramas();
    res.json({ datos: programas, mensaje: 'Programas obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/direcciones-area — Lista direcciones de área
async function obtenerDireccionesArea(req, res, next) {
  try {
    const direcciones = await catalogosQueries.obtenerDireccionesArea(req.query.id_dg);
    res.json({ datos: direcciones, mensaje: 'Direcciones de área obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/valores?tipo=xxx — Obtener valores de un tipo de catálogo genérico
async function obtenerValores(req, res, next) {
  try {
    const { tipo } = req.query;
    if (!tipo) {
      return res.status(400).json({ error: true, mensaje: 'Se requiere el parámetro "tipo".', codigo: 'TIPO_REQUERIDO' });
    }
    const { rows } = await pool.query(
      'SELECT id, tipo, valor, descripcion, orden, extensible, activo FROM catalogos WHERE tipo = $1 AND activo = TRUE ORDER BY orden, valor',
      [tipo]
    );
    res.json({ datos: rows, mensaje: 'Valores obtenidos' });
  } catch (err) {
    next(err);
  }
}

// POST /catalogos/valores — Agregar un valor a un catálogo extensible
async function agregarValor(req, res, next) {
  try {
    const { tipo, valor } = req.body;
    if (!tipo || !valor) {
      return res.status(400).json({ error: true, mensaje: 'Se requiere "tipo" y "valor".', codigo: 'DATOS_INVALIDOS' });
    }
    // Verificar si el tipo es extensible
    const { rows: muestra } = await pool.query(
      'SELECT extensible FROM catalogos WHERE tipo = $1 LIMIT 1',
      [tipo]
    );
    if (muestra.length > 0 && !muestra[0].extensible) {
      return res.status(403).json({ error: true, mensaje: 'Este catálogo no permite agregar valores.', codigo: 'NO_EXTENSIBLE' });
    }
    // Obtener el siguiente orden
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM catalogos WHERE tipo = $1',
      [tipo]
    );
    const { rows } = await pool.query(
      'INSERT INTO catalogos (tipo, valor, orden) VALUES ($1, $2, $3) ON CONFLICT (tipo, valor) DO NOTHING RETURNING *',
      [tipo, valor.trim(), maxRows[0].siguiente]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: true, mensaje: 'El valor ya existe en este catálogo.', codigo: 'DUPLICADO' });
    }
    res.status(201).json({ datos: rows[0], mensaje: 'Valor agregado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerDGs, obtenerUsuarios, obtenerProgramas, obtenerDireccionesArea, obtenerValores, agregarValor };
