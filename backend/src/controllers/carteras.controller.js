/**
 * ARCHIVO: carteras.controller.js
 * PROPÓSITO: Controlador REST para carteras de proyectos.
 *
 * Sin filtrado de permisos por diseño (Opción A, decisión de producto):
 * cualquier usuario autenticado puede ver, crear y gestionar carteras,
 * igual que hoy puede ver cualquier proyecto en /proyectos.
 */
const carterasQueries = require('../db/queries/carteras.queries');

// GET /carteras?busqueda=
async function listar(req, res, next) {
  try {
    const datos = await carterasQueries.listarCarteras({ busqueda: req.query.busqueda });
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /carteras/:id
async function obtener(req, res, next) {
  try {
    const cartera = await carterasQueries.obtenerCarteraPorId(req.params.id);
    if (!cartera) return res.status(404).json({ error: true, mensaje: 'Cartera no encontrada' });
    res.json({ datos: cartera });
  } catch (err) { next(err); }
}

// POST /carteras
async function crear(req, res, next) {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: true, mensaje: 'El nombre de la cartera es obligatorio' });
    }
    const cartera = await carterasQueries.crearCartera(req.body, req.usuario.id);
    res.status(201).json({ datos: cartera, mensaje: 'Cartera creada' });
  } catch (err) { next(err); }
}

// PUT /carteras/:id
async function actualizar(req, res, next) {
  try {
    const cartera = await carterasQueries.actualizarCartera(req.params.id, req.body);
    if (!cartera) return res.status(404).json({ error: true, mensaje: 'Cartera no encontrada' });
    res.json({ datos: cartera, mensaje: 'Cartera actualizada' });
  } catch (err) { next(err); }
}

// DELETE /carteras/:id
async function eliminar(req, res, next) {
  try {
    const cartera = await carterasQueries.eliminarCartera(req.params.id);
    if (!cartera) return res.status(404).json({ error: true, mensaje: 'Cartera no encontrada' });
    res.json({ mensaje: 'Cartera eliminada' });
  } catch (err) { next(err); }
}

// GET /carteras/:id/confirmar-eliminar — cuántos proyectos quedarían sin
// cartera principal, para el diálogo de confirmación antes de DELETE.
async function confirmarEliminar(req, res, next) {
  try {
    const total = await carterasQueries.contarPrincipalesQueQuedanSinCartera(req.params.id);
    res.json({ datos: { proyectos_afectados: total } });
  } catch (err) { next(err); }
}

// GET /carteras/:id/proyectos
async function listarProyectos(req, res, next) {
  try {
    const datos = await carterasQueries.listarProyectosDeCartera(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /carteras/:id/resumen
async function resumen(req, res, next) {
  try {
    const datos = await carterasQueries.resumenCartera(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// POST /carteras/:id/proyectos  { proyecto_ids: [...], es_principal }
async function agregarProyectos(req, res, next) {
  try {
    const { proyecto_ids, es_principal } = req.body;
    if (!Array.isArray(proyecto_ids) || !proyecto_ids.length) {
      return res.status(400).json({ error: true, mensaje: 'proyecto_ids es obligatorio y debe ser un arreglo no vacío' });
    }
    const datos = await carterasQueries.agregarProyectos(req.params.id, proyecto_ids, {
      esPrincipal: !!es_principal,
      agregadoPor: req.usuario.id,
    });
    res.status(201).json({ datos, mensaje: 'Proyectos agregados a la cartera' });
  } catch (err) { next(err); }
}

// DELETE /carteras/:id/proyectos/:proyectoId
async function quitarProyecto(req, res, next) {
  try {
    const resultado = await carterasQueries.quitarProyecto(req.params.id, req.params.proyectoId);
    if (!resultado) return res.status(404).json({ error: true, mensaje: 'El proyecto no pertenece a esta cartera' });
    res.json({ mensaje: 'Proyecto quitado de la cartera' });
  } catch (err) { next(err); }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  confirmarEliminar,
  listarProyectos,
  resumen,
  agregarProyectos,
  quitarProyecto,
};
