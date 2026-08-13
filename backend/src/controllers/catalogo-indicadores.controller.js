/**
 * ARCHIVO: catalogo-indicadores.controller.js
 * PROPÓSITO: API del catálogo de indicadores.
 *
 * MINI-CLASE: quién puede qué
 * ─────────────────────────────────────────────────────────────────
 * Leer el catálogo lo puede hacer cualquier usuario autenticado: sin
 * eso no podría elegir indicadores al capturar su proyecto.
 * Crear también, y a propósito — si agregar un indicador que falta
 * exigiera pedírselo a un administrador, la gente volvería a
 * teclearlo suelto y el catálogo quedaría desactualizado desde el
 * primer día. Queda registrado quién lo creó.
 * Editar, retirar y reactivar son de superadmin: son las operaciones
 * que afectan a proyectos ajenos (ver el guard en las rutas).
 * ─────────────────────────────────────────────────────────────────
 */
const catalogoQueries = require('../db/queries/catalogo-indicadores.queries');

async function listar(req, res, next) {
  try {
    // Solo un superadmin necesita ver los retirados (para reactivarlos);
    // al resto ofrecerle indicadores dados de baja sería un error.
    const incluirInactivos = req.query.incluir_inactivos === 'true'
      && req.usuario?.rol === 'superadmin';

    const datos = await catalogoQueries.listar({
      busqueda: req.query.busqueda || undefined,
      incluirInactivos,
    });
    res.json({ datos });
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const datos = await catalogoQueries.obtener(req.params.id);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos });
  } catch (err) { next(err); }
}

async function uso(req, res, next) {
  try {
    const datos = await catalogoQueries.uso(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    if (req.usuario?.rol === 'externo') {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para agregar indicadores', codigo: 'FORBIDDEN' });
    }
    const datos = await catalogoQueries.crear(req.body, req.usuario.id);
    res.status(201).json({ datos, mensaje: 'Indicador agregado al catálogo' });
  } catch (err) {
    // El duplicado no es un fallo del sistema: el cliente puede usar el
    // que ya existe, así que se devuelve cuál es.
    if (err.codigo === 'DUPLICADO') {
      return res.status(409).json({ error: true, mensaje: err.mensaje || err.message, codigo: 'DUPLICADO', existente: err.existente });
    }
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const datos = await catalogoQueries.actualizar(req.params.id, req.body);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos, mensaje: 'Indicador actualizado' });
  } catch (err) { next(err); }
}

async function cambiarActivo(req, res, next) {
  try {
    const activo = req.body?.activo !== false;
    const datos = await catalogoQueries.cambiarActivo(req.params.id, activo);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos, mensaje: activo ? 'Indicador reactivado' : 'Indicador retirado del catálogo' });
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, uso, crear, actualizar, cambiarActivo };
