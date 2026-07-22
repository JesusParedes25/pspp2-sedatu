/**
 * ARCHIVO: geo.controller.js
 * PROPÓSITO: Endpoints para datos geográficos (geo_estados, geo_municipios, geo_zm).
 *            Sirve tanto selectores (JSON plano) como capas GeoJSON simplificadas.
 */
const pool = require('../db/pool');
const geoQueries = require('../db/queries/geografia.queries');
const miembrosQueries = require('../db/queries/miembros.queries');

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

// GET /inicio/mapa
async function obtenerMapaInicio(req, res, next) {
  try {
    const usuario = req.usuario;
    let proyectoIds;
    if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') {
      const { rows } = await pool.query(
        "SELECT id FROM proyectos WHERE deleted_at IS NULL AND estado != 'Cancelado'"
      );
      proyectoIds = rows.map(r => r.id);
    } else {
      proyectoIds = await miembrosQueries.obtenerProyectosUsuario(usuario.id);
    }

    const datos = await geoQueries.obtenerMapaIncidenciaGeo(proyectoIds || []);
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
  obtenerDetalleEstado,
  obtenerMunicipiosActividadEstado,
  obtenerDetalleZM,
  buscarMunicipios,
};
