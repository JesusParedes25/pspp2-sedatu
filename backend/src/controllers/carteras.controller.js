/**
 * ARCHIVO: carteras.controller.js
 * PROPÓSITO: Controlador REST para carteras de proyectos.
 *
 * VER una cartera sigue sin filtro (cualquier usuario autenticado ve
 * cualquier cartera, igual que ve cualquier proyecto en /proyectos —
 * eso no cambió). Lo que la Fase 1 del modelo de permisos agrega es
 * quién puede ADMINISTRARLA: editarla, eliminarla, agregar o quitar
 * proyectos de ella — antes cualquiera podía (ver migración 080,
 * docs/modelo-permisos.md). Pertenecer a una cartera, o que uno de tus
 * proyectos esté en ella, NO otorga ningún permiso sobre esa cartera
 * ni sobre los demás proyectos que agrupa — una cartera solo agrupa
 * por tema, nunca concede acceso.
 */
const carterasQueries = require('../db/queries/carteras.queries');
const geografiaQueries = require('../db/queries/geografia.queries');
const { puedeVerProyecto } = require('../utils/autorizacion');

function esAdministrador(usuario, cartera) {
  return usuario.rol === 'superadmin' || (!!cartera.id_administrador && cartera.id_administrador === usuario.id);
}

async function exigirAdministrador(req, res) {
  const cartera = await carterasQueries.obtenerCarteraPorId(req.params.id);
  if (!cartera) { res.status(404).json({ error: true, mensaje: 'Cartera no encontrada' }); return null; }
  if (!esAdministrador(req.usuario, cartera)) {
    res.status(403).json({ error: true, mensaje: 'Solo quien administra esta cartera, o un superadmin, puede hacer esto' });
    return null;
  }
  return cartera;
}

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

// POST /carteras — cualquier perfil menos 'externo' (mismo bloqueo que
// crear un proyecto).
async function crear(req, res, next) {
  try {
    if (req.usuario.rol === 'externo') {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para crear carteras' });
    }
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: true, mensaje: 'El nombre de la cartera es obligatorio' });
    }
    const cartera = await carterasQueries.crearCartera(req.body, req.usuario.id);
    res.status(201).json({ datos: cartera, mensaje: 'Cartera creada' });
  } catch (err) { next(err); }
}

// PUT /carteras/:id — solo quien la administra, o superadmin.
async function actualizar(req, res, next) {
  try {
    if (!(await exigirAdministrador(req, res))) return;
    const cartera = await carterasQueries.actualizarCartera(req.params.id, req.body);
    res.json({ datos: cartera, mensaje: 'Cartera actualizada' });
  } catch (err) { next(err); }
}

// DELETE /carteras/:id — solo quien la administra, o superadmin.
async function eliminar(req, res, next) {
  try {
    if (!(await exigirAdministrador(req, res))) return;
    const cartera = await carterasQueries.eliminarCartera(req.params.id);
    res.json({ mensaje: 'Cartera eliminada' });
  } catch (err) { next(err); }
}

// PATCH /carteras/:id/administrador — transferir la administración.
// Solo un superadmin puede hacerlo (no el propio administrador saliente:
// mismo criterio que reasignar al administrador de un proyecto, que hoy
// tampoco tiene una vía de autoservicio — ver docs/modelo-permisos.md).
async function reasignarAdministrador(req, res, next) {
  try {
    if (req.usuario.rol !== 'superadmin') {
      return res.status(403).json({ error: true, mensaje: 'Solo un superadmin puede reasignar al administrador de una cartera' });
    }
    const { id_administrador } = req.body;
    if (!id_administrador) {
      return res.status(400).json({ error: true, mensaje: 'id_administrador es obligatorio' });
    }
    const cartera = await carterasQueries.reasignarAdministrador(req.params.id, id_administrador);
    if (!cartera) return res.status(404).json({ error: true, mensaje: 'Cartera no encontrada' });
    res.json({ datos: cartera, mensaje: 'Administrador de la cartera actualizado' });
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

// GET /carteras/:id/mapa — incidencia territorial de los proyectos de la
// cartera, sin acotar a "mis proyectos" (a diferencia de /inicio/mapa):
// la visibilidad de carteras es total, igual que /carteras/:id/resumen.
async function mapa(req, res, next) {
  try {
    const proyectos = await carterasQueries.listarProyectosDeCartera(req.params.id);
    const datos = await geografiaQueries.obtenerMapaIncidenciaGeo(proyectos.map(p => p.id));
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /carteras/:id/actividad
async function actividad(req, res, next) {
  try {
    const datos = await carterasQueries.actividadCartera(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// POST /carteras/:id/proyectos  { proyecto_ids: [...], es_principal }
// Exige administrar la cartera, y ver (al menos) cada proyecto que se
// agrega — no se puede meter a la cartera un proyecto que ni siquiera
// se puede ver (ver puedeVerProyecto en autorizacion.js).
async function agregarProyectos(req, res, next) {
  try {
    const cartera = await exigirAdministrador(req, res);
    if (!cartera) return;
    const { proyecto_ids, es_principal } = req.body;
    if (!Array.isArray(proyecto_ids) || !proyecto_ids.length) {
      return res.status(400).json({ error: true, mensaje: 'proyecto_ids es obligatorio y debe ser un arreglo no vacío' });
    }
    for (const proyectoId of proyecto_ids) {
      if (!(await puedeVerProyecto(req.usuario, proyectoId))) {
        return res.status(403).json({ error: true, mensaje: 'No puedes agregar un proyecto que no puedes ver' });
      }
    }
    const datos = await carterasQueries.agregarProyectos(req.params.id, proyecto_ids, {
      esPrincipal: !!es_principal,
      agregadoPor: req.usuario.id,
    });
    res.status(201).json({ datos, mensaje: 'Proyectos agregados a la cartera' });
  } catch (err) { next(err); }
}

// DELETE /carteras/:id/proyectos/:proyectoId — solo quien administra
// la cartera, o superadmin.
async function quitarProyecto(req, res, next) {
  try {
    if (!(await exigirAdministrador(req, res))) return;
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
  reasignarAdministrador,
  confirmarEliminar,
  listarProyectos,
  resumen,
  mapa,
  actividad,
  agregarProyectos,
  quitarProyecto,
};
