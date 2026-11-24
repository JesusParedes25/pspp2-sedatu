/**
 * ARCHIVO: alcance-lectura.js
 * PROPÓSITO: Dos candados de LECTURA distintos, para dos preguntas
 *            distintas (ver docs/modelo-permisos.md, sección 5.1):
 *
 *            1. VISIBILIDAD DE SEGUIMIENTO (exigirVisibilidad*, sin
 *               cambios desde su creación): ¿puede ver que este proyecto
 *               existe, su estructura y su avance? Total entre internos;
 *               solo se cierra para 'externo' fuera de lo invitado.
 *
 *            2. PARTICIPACIÓN EN CONTENIDO DE TRABAJO (exigirParticipacion*,
 *               paso 14 DGTIC): comentarios, documentos/evidencias y
 *               riesgos son discusión de equipo, pueden traer información
 *               sensible, o son el reconocimiento de que algo va mal —
 *               no es seguimiento, es contenido de trabajo. Exige una vía
 *               real de funcionEfectivaEnProyecto/funcionEfectivaEnNodo
 *               (creador, invitación, responsable del nodo, bono de DG de
 *               ejecutivo o dirección — ver funcion-efectiva.js), no solo
 *               pertenecer a la Secretaría.
 *
 * NOTA TÉCNICA: por qué esto casi no cambia nada para nadie (vía 1)
 * ─────────────────────────────────────────────────────────────────
 * `puedeVerProyecto` (utils/autorizacion.js) YA implementa la regla de
 * visibilidad — `true` sin condición para cualquier interno, y solo para
 * `externo` exige el peldaño `lectura` sobre ESE proyecto. No se toca ni
 * se duplica esa función aquí: este archivo solo la conecta, vía
 * middleware, a los endpoints que la necesitan. Por eso, para cualquier
 * usuario interno, nada de lo que agrega esta vía cambia el resultado de
 * una sola petición — la condición ya era `true`.
 *
 * NOTA TÉCNICA: por qué participación SÍ puede cambiar el resultado
 * ─────────────────────────────────────────────────────────────────
 * `tienePeldanoProyecto`/`tienePeldanoNodo` (utils/autorizacion.js) NO
 * tienen el atajo "cualquier interno pasa": exigen una vía real. A
 * diferencia de la visibilidad (que siempre colapsa a "¿de qué proyecto
 * es esto?"), aquí SÍ importa el nodo exacto — un responsable de una
 * etapa específica participa en ella aunque no tenga ninguna vía a nivel
 * proyecto (las vías de proyecto bajan hacia los nodos vía topeNodo, pero
 * no al revés). Por eso las entidades polimórficas (comentarios, riesgos,
 * evidencias) se resuelven aquí preservando {tipo, id} del nodo exacto,
 * no solo el id_proyecto que basta para visibilidad.
 *
 * Los endpoints que este archivo protege no identifican su proyecto/nodo
 * de la misma forma (unos por :id directo, otros por una fila intermedia
 * que hay que resolver primero) — así que, igual que ya hace
 * permisos.middleware.js del lado de escritura, aquí se resuelve primero
 * "¿de qué proyecto/nodo es esto?" y después se aplica siempre el mismo
 * criterio.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const { puedeVerProyecto, obtenerProyectoIdDeNodo, tienePeldanoProyecto, tienePeldanoNodo } = require('./autorizacion');

const MENSAJE = 'No puedes ver este proyecto.';
const MENSAJE_PARTICIPACION = 'Este contenido es solo para quienes participan en el proyecto.';

function rechazar(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE, codigo: 'NO_AUTORIZADO' });
}

function rechazarParticipacion(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE_PARTICIPACION, codigo: 'SIN_PARTICIPACION' });
}

// ─── Resolución "nodal" (preserva {tipo, id}, no colapsa a id_proyecto) ──
// de los tipos polimórficos (comentarios, riesgos, evidencias) — misma
// tabla de mapeo que obtenerProyectoIdDeEntidad de abajo, pero para
// participación, donde el nodo exacto sí importa. 'Subproyecto' no se
// resuelve (valor legado sin uso real, ver condicion-riesgo.js) — un
// entidad_tipo desconocido deniega, no truena.
async function resolverEntidadNodal(entidadTipo, entidadId, db) {
  const t = String(entidadTipo || '').toLowerCase();
  if (t === 'proyecto') return { tipo: 'proyecto', id: entidadId };
  if (t === 'riesgo') return resolverEntidadNodalDeRiesgo(entidadId, db);
  if (t === 'subaccion') return { tipo: 'accion', id: entidadId };
  if (t === 'etapa' || t === 'accion' || t === 'tarea') return { tipo: t, id: entidadId };
  return null;
}

async function resolverEntidadNodalDeRiesgo(idRiesgo, db) {
  const conn = db || pool;
  const { rows } = await conn.query('SELECT entidad_tipo, entidad_id FROM riesgos WHERE id = $1', [idRiesgo]);
  if (!rows[0]) return null;
  return resolverEntidadNodal(rows[0].entidad_tipo, rows[0].entidad_id, conn);
}

// Una evidencia cuelga de exactamente una etapa, acción, subacción o
// riesgo (constraint de exclusividad de la tabla) — mismo patrón de
// resolución que exigirEdicionEvidencia en permisos.middleware.js, pero
// para decidir lectura en vez de edición.
async function resolverEntidadNodalDeEvidencia(idEvidencia, db) {
  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT id_etapa, id_accion, id_subaccion, id_riesgo FROM evidencias WHERE id = $1',
    [idEvidencia]
  );
  const e = rows[0];
  if (!e) return null;
  if (e.id_etapa) return { tipo: 'etapa', id: e.id_etapa };
  if (e.id_accion) return { tipo: 'accion', id: e.id_accion };
  if (e.id_subaccion) return { tipo: 'accion', id: e.id_subaccion };
  if (e.id_riesgo) return resolverEntidadNodalDeRiesgo(e.id_riesgo, conn);
  return null;
}

// Una actividad ya trae id_proyecto propio (migración 039) pero también
// id_etapa/id_accion/id_tarea — se resuelve al nodo más específico que
// tenga, por la misma razón que el resto de resolverEntidadNodal*.
async function resolverEntidadNodalDeActividad(idActividad, db) {
  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT id_proyecto, id_etapa, id_accion, id_tarea FROM actividad WHERE id = $1',
    [idActividad]
  );
  const a = rows[0];
  if (!a) return null;
  if (a.id_tarea) return { tipo: 'tarea', id: a.id_tarea };
  if (a.id_accion) return { tipo: 'accion', id: a.id_accion };
  if (a.id_etapa) return { tipo: 'etapa', id: a.id_etapa };
  if (a.id_proyecto) return { tipo: 'proyecto', id: a.id_proyecto };
  return null;
}

// Proyecta una entidad nodal {tipo, id} a su id_proyecto — lo que basta
// para visibilidad (exigirVisibilidadDeEntidadEnQuery, vía 1), sin
// duplicar la consulta SQL de resolverEntidadNodal.
async function proyectoIdDeEntidadNodal(entidad, db) {
  if (!entidad) return null;
  if (entidad.tipo === 'proyecto') return entidad.id;
  return obtenerProyectoIdDeNodo(entidad.tipo, entidad.id, db);
}

async function obtenerProyectoIdDeEntidad(entidadTipo, entidadId, db) {
  return proyectoIdDeEntidadNodal(await resolverEntidadNodal(entidadTipo, entidadId, db), db);
}

// ¿Tiene esta entidad nodal una vía real de participación ('lectura' como
// mínimo)? Única función que decide esto — toda fábrica exigirParticipacion*
// de abajo pasa por aquí, para que agregar una vía nueva (p.ej. un
// identificador de nodo distinto) no implique repetir el criterio.
async function tieneParticipacionEnEntidad(usuario, entidad, db) {
  if (!entidad) return false;
  if (entidad.tipo === 'proyecto') return tienePeldanoProyecto(usuario, entidad.id, 'lectura', db);
  return tienePeldanoNodo(usuario, entidad.tipo, entidad.id, 'lectura', db);
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

// GET /indicadores/:id y GET /indicadores/:id/aportaciones — el
// indicador ya tiene id_proyecto como columna propia, sin necesidad de
// traversal.
const exigirVisibilidadIndicador = (param = 'id') =>
  exigirVisibilidadResuelta(async (req) => {
    const { rows } = await pool.query('SELECT id_proyecto FROM indicadores WHERE id = $1', [req.params[param]]);
    return rows[0]?.id_proyecto || null;
  });

// ─── Fábrica genérica de PARTICIPACIÓN: resolver(req) devuelve una
// entidad nodal ({tipo, id}) o null — vía 2, paso 14 DGTIC. A diferencia
// de exigirVisibilidadResuelta, el resolver NO colapsa a id_proyecto
// (tieneParticipacionEnEntidad necesita el nodo exacto); y el rechazo usa
// un código distinto (SIN_PARTICIPACION) para que el frontend muestre el
// mensaje de "contenido reservado" en vez del de "sin acceso al proyecto".
// Una entidad que no resuelve a nada (dato inexistente/entidad_tipo
// desconocido) se rechaza con el mismo criterio que visibilidad: no es
// una distinción de autorización, es un dato que no existe.
function exigirParticipacionResuelta(resolver) {
  return async (req, res, next) => {
    try {
      const entidad = await resolver(req);
      if (!entidad) return rechazar(res);
      const permitido = await tieneParticipacionEnEntidad(req.usuario, entidad);
      return permitido ? next() : rechazarParticipacion(res);
    } catch (err) {
      return next(err);
    }
  };
}

// Rutas cuyo :param ES el id del proyecto (/proyectos/:id/riesgos, etc.).
const exigirParticipacionProyecto = (param = 'id') =>
  exigirParticipacionResuelta((req) => ({ tipo: 'proyecto', id: req.params[param] }));

// Rutas cuyo :param identifica una etapa/acción/subacción/tarea.
const exigirParticipacionNodo = (tipoNodo, param = 'id') =>
  exigirParticipacionResuelta((req) => resolverEntidadNodal(tipoNodo, req.params[param]));

// GET /riesgos/:id (el :id es el riesgo).
const exigirParticipacionRiesgo = (param = 'id') =>
  exigirParticipacionResuelta((req) => resolverEntidadNodalDeRiesgo(req.params[param]));

// POST /evidencias/:id/boleto; GET /evidencias/:id/ver y /:id/descargar.
const exigirParticipacionEvidencia = (param = 'id') =>
  exigirParticipacionResuelta((req) => resolverEntidadNodalDeEvidencia(req.params[param]));

// POST /actividad/:id/boleto; GET /actividad/:id/ver y /:id/descargar.
const exigirParticipacionActividadPorId = (param = 'id') =>
  exigirParticipacionResuelta((req) => resolverEntidadNodalDeActividad(req.params[param]));

// GET /comentarios — entidad_tipo/entidad_id viajan en la query string.
// Sin ellos no hay nada que autorizar: se deja pasar para que el
// controller dé su propio 400, mismo criterio que exigirVisibilidadDeEntidadEnQuery.
function exigirParticipacionDeEntidadEnQuery() {
  return async (req, res, next) => {
    try {
      const { entidad_tipo, entidad_id } = req.query || {};
      if (!entidad_tipo || !entidad_id) return next();
      const entidad = await resolverEntidadNodal(entidad_tipo, entidad_id);
      if (!entidad) return rechazar(res);
      const permitido = await tieneParticipacionEnEntidad(req.usuario, entidad);
      return permitido ? next() : rechazarParticipacion(res);
    } catch (err) {
      return next(err);
    }
  };
}

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
  // Vía 1: visibilidad de seguimiento (sin cambios, ver nota de arriba).
  exigirVisibilidadProyecto,
  exigirVisibilidadNodo,
  exigirVisibilidadNodoEnParams,
  exigirVisibilidadEntidadEnParams,
  exigirVisibilidadDeEntidadEnQuery,
  exigirVisibilidadIndicador,
  exigirSoloInternos,
  obtenerProyectoIdDeEntidad,
  // Vía 2: participación en contenido de trabajo (paso 14 DGTIC).
  exigirParticipacionProyecto,
  exigirParticipacionNodo,
  exigirParticipacionRiesgo,
  exigirParticipacionEvidencia,
  exigirParticipacionActividadPorId,
  exigirParticipacionDeEntidadEnQuery,
  // Para quien necesite resolver la entidad nodal exacta (p.ej. los
  // controllers que hacen redacción condicional en vez de bloqueo).
  resolverEntidadNodal,
  tieneParticipacionEnEntidad,
};
