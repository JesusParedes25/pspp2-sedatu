/**
 * ARCHIVO: alcance-lectura.js
 * PROPÓSITO: Cerrar, en los endpoints de LECTURA que hoy no verifican nada,
 *            el único caso donde el alcance de lectura NO es total: un
 *            usuario `externo`.
 *
 * MINI-CLASE: por qué esto casi no cambia nada para nadie
 * ─────────────────────────────────────────────────────────────────
 * Modelo de alcance decidido (ver docs/modelo-permisos.md): cualquier
 * perfil interno (superadmin, ejecutivo, direccion, enlace) puede LEER
 * la estructura, avance, documentos, comentarios, riesgos y bitácora de
 * CUALQUIER proyecto, participe o no — lo que distingue a quien participa
 * es poder actuar, no poder ver. `externo` es la única excepción: solo ve
 * los proyectos a los que fue invitado, nada fuera de ahí.
 *
 * `puedeVerProyecto` (utils/autorizacion.js) YA implementa exactamente
 * esta regla — `true` sin condición para cualquier interno, y solo para
 * `externo` exige el peldaño `lectura` sobre ESE proyecto. No se toca ni
 * se duplica esa función aquí: este archivo solo la conecta, vía
 * middleware, a los endpoints que hoy no llaman a nadie. Por eso, para
 * cualquier usuario interno, nada de lo que agrega este archivo cambia
 * el resultado de una sola petición — la condición ya era `true`.
 *
 * Los endpoints que este archivo protege no identifican su proyecto de
 * la misma forma (unos por :id directo, otros por una fila intermedia
 * que hay que resolver primero) — así que, igual que ya hace
 * permisos.middleware.js del lado de escritura, aquí se resuelve primero
 * "¿de qué proyecto es esto?" y después se aplica siempre el mismo
 * criterio.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const { puedeVerProyecto, obtenerProyectoIdDeNodo } = require('./autorizacion');

const MENSAJE = 'No puedes ver este proyecto.';

function rechazar(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE, codigo: 'NO_AUTORIZADO' });
}

// ─── Resolución de "a qué proyecto pertenece esto" para los tipos
// polimórficos (comentarios, bloqueos, riesgos) — misma tabla de mapeo
// que ya usan sus propios controllers (resolverProyectoIdComentario en
// comentarios.controller.js, resolverProyectoId en evidencias.controller.js),
// centralizada aquí porque la necesitan varios endpoints de lectura a la
// vez. 'Subproyecto' no se resuelve (valor legado sin uso real, ver
// condicion-riesgo.js) — un entidad_tipo desconocido deniega, no truena.
async function obtenerProyectoIdDeEntidad(entidadTipo, entidadId, db) {
  const t = String(entidadTipo || '').toLowerCase();
  if (t === 'proyecto') return entidadId;
  if (t === 'riesgo') return obtenerProyectoIdDeRiesgo(entidadId, db);
  if (t === 'etapa' || t === 'accion' || t === 'subaccion' || t === 'tarea') {
    return obtenerProyectoIdDeNodo(t === 'subaccion' ? 'accion' : t, entidadId, db);
  }
  return null;
}

async function obtenerProyectoIdDeRiesgo(idRiesgo, db) {
  const conn = db || pool;
  const { rows } = await conn.query('SELECT entidad_tipo, entidad_id FROM riesgos WHERE id = $1', [idRiesgo]);
  if (!rows[0]) return null;
  return obtenerProyectoIdDeEntidad(rows[0].entidad_tipo, rows[0].entidad_id, conn);
}

// Una evidencia cuelga de exactamente una etapa, acción, subacción o
// riesgo (constraint de exclusividad de la tabla) — mismo patrón de
// resolución que exigirEdicionEvidencia en permisos.middleware.js, pero
// para decidir visibilidad en vez de edición.
async function obtenerProyectoIdDeEvidencia(idEvidencia, db) {
  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT id_etapa, id_accion, id_subaccion, id_riesgo FROM evidencias WHERE id = $1',
    [idEvidencia]
  );
  const e = rows[0];
  if (!e) return null;
  if (e.id_etapa) return obtenerProyectoIdDeNodo('etapa', e.id_etapa, conn);
  if (e.id_accion) return obtenerProyectoIdDeNodo('accion', e.id_accion, conn);
  if (e.id_subaccion) return obtenerProyectoIdDeNodo('accion', e.id_subaccion, conn);
  if (e.id_riesgo) return obtenerProyectoIdDeRiesgo(e.id_riesgo, conn);
  return null;
}

// ─── Fábrica genérica: resolver(req) devuelve un id_proyecto (o null) ────
function exigirVisibilidadResuelta(resolver) {
  return async (req, res, next) => {
    try {
      const idProyecto = await resolver(req);
      if (!idProyecto) return rechazar(res);
      const permitido = await puedeVerProyecto(req.usuario, idProyecto);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// Rutas cuyo :param ES el id del proyecto (/proyectos/:id/...).
const exigirVisibilidadProyecto = (param = 'id') =>
  exigirVisibilidadResuelta((req) => req.params[param]);

// Rutas cuyo :param identifica una etapa/acción/subacción/tarea.
const exigirVisibilidadNodo = (tipoNodo, param = 'id') =>
  exigirVisibilidadResuelta((req) => obtenerProyectoIdDeNodo(tipoNodo, req.params[param]));

// GET /cobertura/:tipo/:id — el tipo de entidad (proyecto/etapa/accion/
// subaccion/tarea) viaja en la propia ruta, igual que ya hace
// puedeCapturarEnEntidad en geografia.controller.js para el lado de
// escritura. 'proyecto' resuelve directo; cualquier otro tipo se resuelve
// como nodo (obtenerProyectoIdDeNodo ya trata 'subaccion' como 'accion').
const exigirVisibilidadEntidadEnParams = (tipoParam = 'tipo', idParam = 'id') =>
  exigirVisibilidadResuelta((req) => {
    const tipo = String(req.params[tipoParam] || '').toLowerCase();
    const id = req.params[idParam];
    if (tipo === 'proyecto') return id;
    return obtenerProyectoIdDeNodo(tipo, id);
  });

// GET /actividad/:tipo_nodo/:id_nodo — el tipo viaja en la propia ruta.
// Un tipo fuera de los tres soportados deja pasar (next()) para que
// actividadController dé su propio 400 "tipo_nodo inválido" — mismo
// criterio que exigirVisibilidadDeEntidadEnQuery usa para una entidad sin
// datos: no es un caso de autorización, es un caso de validación que no
// nos toca resolver con un 403.
function exigirVisibilidadNodoEnParams(tipoParam = 'tipo_nodo', idParam = 'id_nodo') {
  return async (req, res, next) => {
    try {
      const tipo = req.params[tipoParam];
      if (!['etapa', 'accion', 'tarea'].includes(tipo)) return next();
      const idProyecto = await obtenerProyectoIdDeNodo(tipo, req.params[idParam]);
      if (!idProyecto) return rechazar(res);
      const permitido = await puedeVerProyecto(req.usuario, idProyecto);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// GET /comentarios y GET /bloqueos|/bloqueos/activo — entidad_tipo/
// entidad_id viajan en la query string. Sin ellos no hay nada que
// autorizar: se deja pasar para que el controller dé su propio 400,
// mismo criterio que ya usa exigirEdicionDeEntidadEnCuerpo del lado de
// escritura (permisos.middleware.js) cuando faltan en el body.
function exigirVisibilidadDeEntidadEnQuery() {
  return async (req, res, next) => {
    try {
      const { entidad_tipo, entidad_id } = req.query || {};
      if (!entidad_tipo || !entidad_id) return next();
      const idProyecto = await obtenerProyectoIdDeEntidad(entidad_tipo, entidad_id);
      if (!idProyecto) return rechazar(res);
      const permitido = await puedeVerProyecto(req.usuario, idProyecto);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// GET /riesgos/:id y GET /riesgos/:id/evidencias (el :id es el riesgo).
const exigirVisibilidadRiesgo = (param = 'id') =>
  exigirVisibilidadResuelta((req) => obtenerProyectoIdDeRiesgo(req.params[param]));

// GET /indicadores/:id y GET /indicadores/:id/aportaciones — el
// indicador ya tiene id_proyecto como columna propia, sin necesidad de
// traversal.
const exigirVisibilidadIndicador = (param = 'id') =>
  exigirVisibilidadResuelta(async (req) => {
    const { rows } = await pool.query('SELECT id_proyecto FROM indicadores WHERE id = $1', [req.params[param]]);
    return rows[0]?.id_proyecto || null;
  });

// GET /evidencias/:id/descargar.
const exigirVisibilidadEvidencia = (param = 'id') =>
  exigirVisibilidadResuelta((req) => obtenerProyectoIdDeEvidencia(req.params[param]));

// GET /actividad/:id/descargar — actividad ya trae id_proyecto propio
// (migración 039), sin traversal.
const exigirVisibilidadActividadPorId = (param = 'id') =>
  exigirVisibilidadResuelta(async (req) => {
    const { rows } = await pool.query('SELECT id_proyecto FROM actividad WHERE id = $1', [req.params[param]]);
    return rows[0]?.id_proyecto || null;
  });

// Para recursos que NO pertenecen a ningún proyecto (plantillas de
// importación, que son por Dirección General) — no hay id_proyecto que
// resolver, así que no se puede literalmente llamar a puedeVerProyecto
// (exige un idProyecto). Replica su mismo criterio interno sin el
// requisito de proyecto: cualquier interno pasa sin condición, solo
// `externo` se rechaza — un usuario externo no tiene ninguna razón para
// leer una plantilla de importación, que no pertenece a ningún proyecto
// al que haya sido invitado.
function exigirSoloInternos() {
  return (req, res, next) => {
    if (req.usuario?.rol === 'externo') return rechazar(res);
    return next();
  };
}

module.exports = {
  exigirVisibilidadProyecto,
  exigirVisibilidadNodo,
  exigirVisibilidadNodoEnParams,
  exigirVisibilidadEntidadEnParams,
  exigirVisibilidadDeEntidadEnQuery,
  exigirVisibilidadRiesgo,
  exigirVisibilidadIndicador,
  exigirVisibilidadEvidencia,
  exigirVisibilidadActividadPorId,
  exigirSoloInternos,
  obtenerProyectoIdDeEntidad,
  obtenerProyectoIdDeRiesgo,
  obtenerProyectoIdDeEvidencia,
};
