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

// GET /catalogos/dgs — Lista todas las DGs
async function obtenerDGs(req, res, next) {
  try {
    const dgs = await catalogosQueries.obtenerDGs();
    res.json({ datos: dgs, mensaje: 'DGs obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /catalogos/usuarios — Lista usuarios, opcionalmente filtrados por DG
async function obtenerUsuarios(req, res, next) {
  try {
    const usuarios = await catalogosQueries.obtenerUsuarios(req.query.id_dg);
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

module.exports = { obtenerDGs, obtenerUsuarios, obtenerProgramas, obtenerDireccionesArea };
