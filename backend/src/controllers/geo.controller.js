/**
 * ARCHIVO: geo.controller.js
 * PROPÓSITO: Endpoints para datos geográficos (geo_estados, geo_municipios, geo_zm).
 *            Sirve tanto selectores (JSON plano) como capas GeoJSON simplificadas.
 */
const geoQueries = require('../db/queries/geografia.queries');
const miembrosQueries = require('../db/queries/miembros.queries');
const carterasQueries = require('../db/queries/carteras.queries');
const { alcanceProyectosUsuario } = require('../utils/alcanceProyectos');

// Mismo filtro opcional que ya soporta GET /inicio (proyecto_ids= o
// cartera_id=, mutuamente excluyentes) — "Incidencia territorial" es
// parte del Tablero y debe acotarse igual que el resto de sus widgets.
async function aplicarFiltroTablero(proyectoIds, query) {
  const { proyecto_ids: proyectoIdsQuery, cartera_id: carteraIdQuery } = query;
  if (carteraIdQuery) {
    const idsCartera = new Set(await carterasQueries.obtenerProyectoIdsDeCartera(carteraIdQuery));
    return proyectoIds.filter(id => idsCartera.has(id));
  }
  if (proyectoIdsQuery) {
    const pedidos = new Set(String(proyectoIdsQuery).split(',').map(s => s.trim()).filter(Boolean));
    return proyectoIds.filter(id => pedidos.has(id));
  }
  return proyectoIds;
}

// GET /geo/estados
async function obtenerEstados(req, res, next) {
  try {
    const datos = await geoQueries.obtenerEstadosGeo();
    res.json({ datos, mensaje: 'Estados obtenidos' });
  } catch (err) { next(err); }
}

// GET /geo/estados/geojson
async function obtenerEstadosGeoJSON(req, res, next) {
  try {
    const fc = await geoQueries.obtenerEstadosGeoJSON();
    res.json(fc);
  } catch (err) { next(err); }
}

// GET /geo/municipios?cve_ent=XX
async function obtenerMunicipios(req, res, next) {
  try {
    const { cve_ent } = req.query;
    if (!cve_ent) return res.status(400).json({ error: true, mensaje: 'Se requiere cve_ent' });
    const datos = await geoQueries.obtenerMunicipiosGeo(cve_ent);
    res.json({ datos, mensaje: 'Municipios obtenidos' });
  } catch (err) { next(err); }
}

// GET /geo/municipios/geojson?cve_ent=XX
async function obtenerMunicipiosGeoJSON(req, res, next) {
  try {
    const { cve_ent } = req.query;
    const fc = await geoQueries.obtenerMunicipiosGeoJSON(cve_ent || null);
    res.json(fc);
  } catch (err) { next(err); }
}

// GET /geo/zm
async function obtenerZM(req, res, next) {
  try {
    const datos = await geoQueries.obtenerZMGeo();
    res.json({ datos, mensaje: 'Zonas metropolitanas obtenidas' });
  } catch (err) { next(err); }
}

// GET /geo/zm/geojson
async function obtenerZMGeoJSON(req, res, next) {
  try {
    const fc = await geoQueries.obtenerZMGeoJSON();
    res.json(fc);
  } catch (err) { next(err); }
}

// GET /proyectos/:id/mapa-territorial
async function obtenerMapaTerritorial(req, res, next) {
  try {
    const datos = await geoQueries.obtenerMapaTerritorialProyecto(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /inicio/mapa?proyecto_ids=&cartera_id=
async function obtenerMapaInicio(req, res, next) {
  try {
    const proyectoIds = await aplicarFiltroTablero(await alcanceProyectosUsuario(req.usuario), req.query);
    const datos = await geoQueries.obtenerMapaIncidenciaGeo(proyectoIds);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /inicio/mapa/zm?proyecto_ids=&cartera_id= — mismo resumen que
// /inicio/mapa pero por Zona Metropolitana, para el hover del mapa en
// modo ZM.
async function obtenerMapaZmInicio(req, res, next) {
  try {
    const proyectoIds = await aplicarFiltroTablero(await alcanceProyectosUsuario(req.usuario), req.query);
    const datos = await geoQueries.obtenerMapaIncidenciaGeoZM(proyectoIds);
    res.json({ datos });
  } catch (err) { next(err); }
}

// Determina el filtro de acceso del usuario: null = ve todo (superadmin/ejecutivo)
async function resolverProyectoIds(usuario) {
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return null;
  return miembrosQueries.obtenerProyectosUsuario(usuario.id);
}

// Aplica el filtro opcional ?proyecto_id= sobre el conjunto de acceso del usuario
function aplicarFiltroProyecto(proyectoIds, proyectoIdQuery) {
  if (!proyectoIdQuery) return proyectoIds;
  if (proyectoIds === null) return [proyectoIdQuery];
  return proyectoIds.filter(id => id === proyectoIdQuery);
}

// GET /geo/territorio/estado/:cve_ent/detalle?proyecto_id=
async function obtenerDetalleEstado(req, res, next) {
  try {
    const { cve_ent } = req.params;
    const proyectoIds = aplicarFiltroProyecto(await resolverProyectoIds(req.usuario), req.query.proyecto_id);
    const datos = await geoQueries.obtenerDetalleEstado(cve_ent, proyectoIds);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /geo/territorio/estado/:cve_ent/municipios-actividad?proyecto_id=
async function obtenerMunicipiosActividadEstado(req, res, next) {
  try {
    const { cve_ent } = req.params;
    const proyectoIds = aplicarFiltroProyecto(await resolverProyectoIds(req.usuario), req.query.proyecto_id);
    const datos = await geoQueries.obtenerMunicipiosActividadEstado(cve_ent, proyectoIds);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /geo/territorio/zm/:gid/detalle?proyecto_id=
async function obtenerDetalleZM(req, res, next) {
  try {
    const { gid } = req.params;
    const proyectoIds = aplicarFiltroProyecto(await resolverProyectoIds(req.usuario), req.query.proyecto_id);
    const datos = await geoQueries.obtenerDetalleZM(gid, proyectoIds);
    res.json({ datos });
  } catch (err) { next(err); }
}

// GET /geo/municipios/buscar?q=
async function buscarMunicipios(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ datos: [] });
    const datos = await geoQueries.buscarMunicipiosGeoFuzzy(q.trim());
    res.json({ datos });
  } catch (err) { next(err); }
}

module.exports = {
  obtenerEstados,
  obtenerEstadosGeoJSON,
  obtenerMunicipios,
  obtenerMunicipiosGeoJSON,
  obtenerZM,
  obtenerZMGeoJSON,
  obtenerMapaTerritorial,
  obtenerMapaInicio,
  obtenerMapaZmInicio,
  obtenerDetalleEstado,
  obtenerMunicipiosActividadEstado,
  obtenerDetalleZM,
  buscarMunicipios,
};
