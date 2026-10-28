/**
 * ARCHIVO: permisos.middleware.js
 * PROPÓSITO: Exigir permiso de captura antes de que la petición llegue al
 *            controller, en las rutas que escriben la estructura de un
 *            proyecto (etapas, acciones, subacciones y tareas).
 *
 * MINI-CLASE: por qué middleware y no un if dentro de cada controller
 * ─────────────────────────────────────────────────────────────────
 * Estos endpoints —PUT /etapas/:id, PATCH /acciones/:id, POST
 * /acciones/:id/tareas y compañía— no verificaban nada: la interfaz
 * escondía los botones al que no debía verlos, pero eso es comodidad,
 * no seguridad. Quien armaba la petición a mano escribía en el proyecto
 * de cualquier área.
 *
 * Se resuelve en la capa de rutas, no dentro de cada función, por dos
 * razones. Primero, son quince endpoints repartidos en tres controllers
 * y varias funciones con lógica delicada (transacciones, recálculo en
 * cascada de avances): meter un `if` en cada una es quince
 * oportunidades de romper algo. Segundo, así la lista de rutas
 * protegidas se lee de un vistazo en los archivos de rutas, y una ruta
 * nueva que se olvide de protegerse se nota.
 *
 * La regla vive en utils/autorizacion.js, no aquí. Este archivo solo
 * traduce "no autorizado" a un 403 con mensaje.
 * ─────────────────────────────────────────────────────────────────
 */
const { puedeEditarNodo, puedeEditarContenidoProyecto, tienePeldanoNodo, tienePeldanoProyecto } = require('../utils/autorizacion');
const pool = require('../db/pool');

const MENSAJE = 'No tienes permisos para capturar en este proyecto. '
  + 'Solicítalo a su responsable o a la Dirección General que lo lidera.';

function rechazar(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE, codigo: 'NO_AUTORIZADO' });
}

const MENSAJE_RESPONSABLE = 'Crear o eliminar elementos de la estructura requiere ser responsable aquí, '
  + 'no solo poder capturar. Solicítalo a quien administra este proyecto.';

function rechazarResponsable(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE_RESPONSABLE, codigo: 'NO_AUTORIZADO' });
}

// Protege rutas cuyo :param identifica una etapa, acción o tarea.
// Uso: router.put('/:id', exigirEdicionNodo('etapa'), controller.actualizar)
function exigirEdicionNodo(tipoNodo, param = 'id') {
  return async (req, res, next) => {
    try {
      const idNodo = req.params[param];
      if (!idNodo) return rechazar(res);
      const permitido = await puedeEditarNodo({ usuario: req.usuario, tipoNodo, idNodo });
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// Protege rutas cuyo :param identifica directamente un proyecto
// (crear una etapa, crear una acción suelta, importar estructura).
function exigirEdicionProyecto(param = 'id') {
  return async (req, res, next) => {
    try {
      const idProyecto = req.params[param];
      if (!idProyecto) return rechazar(res);
      const permitido = await puedeEditarContenidoProyecto({ usuario: req.usuario, idProyecto });
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// Crear o eliminar un hijo (etapa/acción/subacción/tarea) exige
// 'responsable' EN EL PADRE — un peldaño más que capturar en el padre
// mismo (docs/modelo-permisos.md, tabla de peldaños mínimos). Protege
// las rutas anidadas de creación; DELETE /etapas|acciones|tareas/:id
// aplican la misma regla por su cuenta, dentro del controller
// (puedeGestionarNodo, ya resuelve "responsable en el padre").
function exigirResponsableNodo(tipoNodo, param = 'id') {
  return async (req, res, next) => {
    try {
      const idNodo = req.params[param];
      if (!idNodo) return rechazarResponsable(res);
      const permitido = await tienePeldanoNodo(req.usuario, tipoNodo, idNodo, 'responsable');
      return permitido ? next() : rechazarResponsable(res);
    } catch (err) {
      return next(err);
    }
  };
}

function exigirResponsableProyecto(param = 'id') {
  return async (req, res, next) => {
    try {
      const idProyecto = req.params[param];
      if (!idProyecto) return rechazarResponsable(res);
      const permitido = await tienePeldanoProyecto(req.usuario, idProyecto, 'responsable');
      return permitido ? next() : rechazarResponsable(res);
    } catch (err) {
      return next(err);
    }
  };
}


// ─── Aportar cosas AL proyecto: comentarios, archivos, riesgos, indicadores ──
//
// Estos endpoints identifican su objetivo de maneras distintas —unos con
// entidad_tipo+entidad_id en el cuerpo, otros con el id de un riesgo, un
// indicador o una aportación en la ruta— pero la pregunta siempre es la
// misma: "¿puede esta persona capturar en el nodo (o proyecto) al que
// esto pertenece?". Lo que cambia es cómo se llega hasta ahí, así que se
// resuelve el objetivo y después se aplica la misma regla de siempre.
//
// Comentar, adjuntar y reportar riesgos son formas de participar, no de
// mirar. Antes ninguno verificaba nada: alguien sin invitación podía
// comentar, subir archivos y abrir riesgos en cualquier proyecto de la
// Secretaría. Leerlos sigue abierto para todos — la visibilidad es total,
// lo que se cierra es escribir.

const TIPO_A_NODO = { etapa: 'etapa', accion: 'accion', subaccion: 'accion', tarea: 'tarea' };

// El corazón: (tipo, id) → ¿puede capturar ahí?
async function puedeCapturarEn(usuario, entidadTipo, entidadId) {
  if (!usuario || !entidadId) return false;
  const t = String(entidadTipo || '').toLowerCase();
  if (t === 'proyecto') {
    return puedeEditarContenidoProyecto({ usuario, idProyecto: entidadId });
  }
  const tipoNodo = TIPO_A_NODO[t];
  if (!tipoNodo) return false;
  return puedeEditarNodo({ usuario, tipoNodo, idNodo: entidadId });
}

// Para POST /comentarios y POST /riesgos: el objetivo viene en el cuerpo.
function exigirEdicionDeEntidadEnCuerpo() {
  return async (req, res, next) => {
    try {
      const { entidad_tipo, entidad_id } = req.body || {};
      // Sin entidad no hay nada que autorizar: se deja pasar para que el
      // controller devuelva su propio 400 de campos requeridos.
      if (!entidad_tipo || !entidad_id) return next();
      const permitido = await puedeCapturarEn(req.usuario, entidad_tipo, entidad_id);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

// Fábrica para los casos "el id de la ruta apunta a una fila que sabe a
// qué entidad pertenece". `resolver` devuelve { tipo, id } o null.
function exigirEdicionResuelta(resolver) {
  return async (req, res, next) => {
    try {
      const objetivo = await resolver(req);
      if (!objetivo) return rechazar(res);
      const permitido = await puedeCapturarEn(req.usuario, objetivo.tipo, objetivo.id);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

const resolverPorTabla = (tabla, param = 'id') => async (req) => {
  const { rows } = await pool.query(
    `SELECT entidad_tipo, entidad_id FROM ${tabla} WHERE id = $1`, [req.params[param]]
  );
  if (!rows[0]) return null;
  return { tipo: rows[0].entidad_tipo, id: rows[0].entidad_id };
};

// Un comentario hereda la entidad del hilo al que responde.
const exigirEdicionComentario = (param = 'id') => exigirEdicionResuelta(resolverPorTabla('comentarios', param));
const exigirEdicionRiesgo = (param = 'id') => exigirEdicionResuelta(resolverPorTabla('riesgos', param));

// Una evidencia cuelga de una etapa, una acción, una subacción o un riesgo.
const exigirEdicionEvidencia = (param = 'id') => exigirEdicionResuelta(async (req) => {
  const { rows } = await pool.query(
    'SELECT id_etapa, id_accion, id_subaccion, id_riesgo FROM evidencias WHERE id = $1',
    [req.params[param]]
  );
  const e = rows[0];
  if (!e) return null;
  if (e.id_etapa) return { tipo: 'etapa', id: e.id_etapa };
  if (e.id_accion) return { tipo: 'accion', id: e.id_accion };
  if (e.id_subaccion) return { tipo: 'accion', id: e.id_subaccion };
  if (e.id_riesgo) {
    const { rows: r } = await pool.query('SELECT entidad_tipo, entidad_id FROM riesgos WHERE id = $1', [e.id_riesgo]);
    return r[0] ? { tipo: r[0].entidad_tipo, id: r[0].entidad_id } : null;
  }
  return null;
});

// Los indicadores son del proyecto (aunque estén vinculados a una etapa):
// definir la meta institucional no es capturar avance de una etapa suelta.
const exigirEdicionIndicador = (param = 'id') => exigirEdicionResuelta(async (req) => {
  const { rows } = await pool.query('SELECT id_proyecto FROM indicadores WHERE id = $1', [req.params[param]]);
  return rows[0] ? { tipo: 'proyecto', id: rows[0].id_proyecto } : null;
});

// PATCH /movimientos/:id/anular — el movimiento no trae id_proyecto
// propio, se resuelve vía su indicador (misma traversal que
// exigirEdicionIndicador, un salto más abajo).
const exigirEdicionMovimientoIndicador = (param = 'id') => exigirEdicionResuelta(async (req) => {
  const { rows } = await pool.query(
    `SELECT i.id_proyecto FROM indicador_movimientos m
       JOIN indicadores i ON i.id = m.id_indicador
      WHERE m.id = $1`,
    [req.params[param]]
  );
  return rows[0] ? { tipo: 'proyecto', id: rows[0].id_proyecto } : null;
});

// Una aportación sí es captura de un nodo concreto: quien tiene esa etapa
// asignada puede declarar cuánto aporta al indicador.
const exigirEdicionAportacion = (param = 'id') => exigirEdicionResuelta(async (req) => {
  const { rows } = await pool.query(
    'SELECT id_indicador, id_etapa, id_accion, id_tarea FROM indicador_aportaciones WHERE id = $1',
    [req.params[param]]
  );
  const a = rows[0];
  if (!a) return null;
  if (a.id_etapa) return { tipo: 'etapa', id: a.id_etapa };
  if (a.id_accion) return { tipo: 'accion', id: a.id_accion };
  if (a.id_tarea) return { tipo: 'tarea', id: a.id_tarea };
  const { rows: i } = await pool.query('SELECT id_proyecto FROM indicadores WHERE id = $1', [a.id_indicador]);
  return i[0] ? { tipo: 'proyecto', id: i[0].id_proyecto } : null;
});

// POST /indicadores/:id/aportaciones — el nodo va en el cuerpo; si no
// viene ninguno, la aportación es del proyecto dueño del indicador.
function exigirEdicionAportacionNueva(param = 'id') {
  return exigirEdicionResuelta(async (req) => {
    const { id_etapa, id_accion, id_tarea } = req.body || {};
    if (id_etapa) return { tipo: 'etapa', id: id_etapa };
    if (id_accion) return { tipo: 'accion', id: id_accion };
    if (id_tarea) return { tipo: 'tarea', id: id_tarea };
    const { rows } = await pool.query('SELECT id_proyecto FROM indicadores WHERE id = $1', [req.params[param]]);
    return rows[0] ? { tipo: 'proyecto', id: rows[0].id_proyecto } : null;
  });
}

// ─── Bloqueos: resolver por id de la fila ─────────────────────────────
//
// GET /bloqueos y GET /bloqueos/activo (leer) usaban aquí un criterio de
// captura-o-superior (exigirEdicionDeEntidadEnQuery, Fase 2/Paso 0) — se
// retiró en Fase 2/Paso 1: un bloqueo es parte de la bitácora del nodo,
// con la misma visibilidad total entre internos que cualquier otro dato
// de proyecto (ver docs/modelo-permisos.md sección 7.1), así que esos dos
// GET pasan a exigirVisibilidadDeEntidadEnQuery (utils/alcance-lectura.js)
// en vez de vivir aquí. Resolver un bloqueo SÍ sigue siendo una acción de
// escritura, no una lectura — por eso solo esta factory se queda.

// PUT /bloqueos/:id/resolver: lo puede resolver quien lo creó, o quien
// tiene captura-or-superior en la entidad que el bloqueo bloquea — el
// mismo criterio de puedeCapturarEn, con la excepción del creador porque
// resolver tu propio bloqueo no debería depender de seguir teniendo
// permiso de captura en ese nodo más adelante.
const exigirResolverBloqueo = (param = 'id') => async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT entidad_tipo, entidad_id, id_creador FROM bloqueos WHERE id = $1',
      [req.params[param]]
    );
    const bloqueo = rows[0];
    if (!bloqueo) return rechazar(res);
    if (bloqueo.id_creador === req.usuario?.id) return next();
    const permitido = await puedeCapturarEn(req.usuario, bloqueo.entidad_tipo, bloqueo.entidad_id);
    return permitido ? next() : rechazar(res);
  } catch (err) {
    return next(err);
  }
};

// POST /actividad: mismo criterio "leer abierto, escribir cerrado" que ya
// aplica comentarios.routes.js vía exigirEdicionDeEntidadEnCuerpo, pero
// actividad.controller.js nombra sus campos tipo_nodo/id_nodo en vez de
// entidad_tipo/entidad_id — no reusa esa factory porque los nombres de
// campo no calzan, pero sí reusa puedeCapturarEn, el mismo núcleo.
function exigirEdicionDeNodoEnCuerpo() {
  return async (req, res, next) => {
    try {
      const { tipo_nodo, id_nodo } = req.body || {};
      if (!tipo_nodo || !id_nodo) return next();
      const permitido = await puedeCapturarEn(req.usuario, tipo_nodo, id_nodo);
      return permitido ? next() : rechazar(res);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  exigirEdicionNodo,
  exigirEdicionProyecto,
  exigirResponsableNodo,
  exigirResponsableProyecto,
  exigirEdicionDeEntidadEnCuerpo,
  exigirEdicionComentario,
  exigirEdicionRiesgo,
  exigirEdicionEvidencia,
  exigirEdicionIndicador,
  exigirEdicionMovimientoIndicador,
  exigirEdicionAportacion,
  exigirEdicionAportacionNueva,
  exigirResolverBloqueo,
  exigirEdicionDeNodoEnCuerpo,
};
