/**
 * ARCHIVO: riesgos.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de riesgos y problemas.
 *
 * MINI-CLASE: Riesgos vs Problemas en gestión de proyectos
 * ─────────────────────────────────────────────────────────────────
 * Un RIESGO es algo que PODRÍA ocurrir y afectar al proyecto.
 * Un PROBLEMA es algo que YA ocurrió y está afectando. Ambos se
 * gestionan en la misma tabla con el campo "tipo" ('Riesgo' o
 * 'Problema'). Cada riesgo tiene un nivel de severidad (Bajo,
 * Medio, Alto, Crítico) y un estado de gestión (Abierto,
 * En_mitigacion, Resuelto, Cerrado). Se pueden vincular a
 * cualquier nivel del proyecto mediante entidad_tipo + entidad_id.
 * ─────────────────────────────────────────────────────────────────
 */
const riesgosQueries = require('../db/queries/riesgos.queries');
const { notificarEquipoProyecto, crearNotificacion } = require('../utils/notificaciones');
const pool = require('../db/pool');

const ETIQUETA_ENTIDAD = { Proyecto: 'el proyecto', Etapa: 'la etapa', Accion: 'la acción', Subaccion: 'la acción', Tarea: 'la tarea' };

// "la etapa «Diagnóstico»" o "el proyecto «X»" — mismo criterio que
// describirDestino en solicitudes.controller.js, para los avisos de
// asignación de responsable.
function describirEntidad(entidadTipo, nombreEntidad) {
  const etiqueta = ETIQUETA_ENTIDAD[entidadTipo] || 'el elemento';
  return `${etiqueta} "${nombreEntidad || 'sin nombre'}"`;
}

// Resuelve el id_proyecto de un riesgo a partir de su entidad vinculada,
// igual que resolverProyectoIdComentario en comentarios.controller.js.
async function resolverProyectoIdRiesgo(entidad_tipo, entidad_id) {
  // entidad_tipo llega con mayúscula inicial ('Etapa','Accion','Proyecto',
  // igual que exige el CHECK de la tabla riesgos) — normalizamos para no
  // depender de que quien llame mande el casing exacto.
  const t = (entidad_tipo || '').toLowerCase();
  if (t === 'proyecto') return entidad_id;
  if (t === 'etapa') {
    const { rows } = await pool.query('SELECT id_proyecto FROM etapas WHERE id = $1', [entidad_id]);
    return rows[0]?.id_proyecto;
  }
  if (t === 'accion' || t === 'subaccion') {
    const { rows } = await pool.query('SELECT id_proyecto, id_etapa FROM acciones WHERE id = $1', [entidad_id]);
    if (rows[0]?.id_proyecto) return rows[0].id_proyecto;
    if (rows[0]?.id_etapa) {
      const { rows: e } = await pool.query('SELECT id_proyecto FROM etapas WHERE id = $1', [rows[0].id_etapa]);
      return e[0]?.id_proyecto;
    }
  }
  if (t === 'tarea') {
    const { rows } = await pool.query('SELECT id_accion FROM tareas WHERE id = $1', [entidad_id]);
    if (rows[0]?.id_accion) return resolverProyectoIdRiesgo('Accion', rows[0].id_accion);
  }
  return null;
}

// GET /proyectos/:id/riesgos — Listar riesgos del proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorProyecto(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id/riesgos — Listar riesgos de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorEtapa(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos de etapa obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /riesgos/:id — Obtener un riesgo
async function obtenerPorId(req, res, next) {
  try {
    const riesgo = await riesgosQueries.obtenerRiesgoPorId(req.params.id);

    if (!riesgo) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: riesgo, mensaje: 'Riesgo obtenido' });
  } catch (err) {
    next(err);
  }
}

// Nombre de la entidad a la que pertenece el riesgo — para el mensaje de
// la notificación de asignación (resolverProyectoIdRiesgo ya resuelve el
// proyecto; esto resuelve el nombre de la entidad puntual).
async function nombreEntidadRiesgo(entidadTipo, entidadId) {
  const t = (entidadTipo || '').toLowerCase();
  const tabla = t === 'etapa' ? 'etapas'
    : (t === 'accion' || t === 'subaccion') ? 'acciones'
    : t === 'tarea' ? 'tareas'
    : t === 'proyecto' ? 'proyectos' : null;
  if (!tabla) return null;
  const { rows } = await pool.query(`SELECT nombre FROM ${tabla} WHERE id = $1`, [entidadId]);
  return rows[0]?.nombre || null;
}

// POST /riesgos — Crear un riesgo
async function crear(req, res, next) {
  try {
    const datos = {
      ...req.body,
      id_reportador: req.usuario.id
    };

    const riesgo = await riesgosQueries.crearRiesgo(datos);

    const pId = await resolverProyectoIdRiesgo(riesgo.entidad_tipo, riesgo.entidad_id);
    if (pId) {
      const etiquetaTipo = riesgo.tipo === 'Problema' ? 'Problema' : 'Riesgo';
      await notificarEquipoProyecto(
        pId, 'Riesgo',
        `${etiquetaTipo} reportado (nivel ${riesgo.nivel}): "${riesgo.titulo}"`,
        riesgo.entidad_tipo, riesgo.entidad_id, req.usuario.id
      );
    }

    // Si se propuso un responsable distinto de quien reporta, esa persona
    // tiene que enterarse y decidir si acepta — no queda asignada de facto.
    if (riesgo.id_responsable && riesgo.estado_responsable === 'pendiente') {
      const nombreEntidad = await nombreEntidadRiesgo(riesgo.entidad_tipo, riesgo.entidad_id);
      await crearNotificacion({
        tipo: 'AsignacionRiesgo',
        mensaje: `${req.usuario.nombre_completo} te propuso como responsable del riesgo "${riesgo.titulo}" en ${describirEntidad(riesgo.entidad_tipo, nombreEntidad)}.`,
        entidadTipo: riesgo.entidad_tipo,
        entidadId: riesgo.entidad_id,
        idUsuario: riesgo.id_responsable,
      });
    }

    res.status(201).json({ datos: riesgo, mensaje: 'Riesgo registrado exitosamente' });
  } catch (err) {
    next(err);
  }
}

// PUT /riesgos/:id — Actualizar un riesgo
async function actualizar(req, res, next) {
  try {
    const riesgo = await riesgosQueries.actualizarRiesgo(req.params.id, req.body, req.usuario.id);

    if (!riesgo) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    if (riesgo.id_responsable && riesgo.estado_responsable === 'pendiente') {
      const nombreEntidad = await nombreEntidadRiesgo(riesgo.entidad_tipo, riesgo.entidad_id);
      await crearNotificacion({
        tipo: 'AsignacionRiesgo',
        mensaje: `${req.usuario.nombre_completo} te propuso como responsable del riesgo "${riesgo.titulo}" en ${describirEntidad(riesgo.entidad_tipo, nombreEntidad)}.`,
        entidadTipo: riesgo.entidad_tipo,
        entidadId: riesgo.entidad_id,
        idUsuario: riesgo.id_responsable,
      });
    }

    res.json({ datos: riesgo, mensaje: 'Riesgo actualizado' });
  } catch (err) {
    next(err);
  }
}

// POST /riesgos/:id/responder-asignacion — { respuesta: 'aceptar'|'declinar', motivo }
// Solo quien fue propuesto como responsable puede responder su propia
// asignación — no es una facultad de quien edita el riesgo.
async function responderAsignacion(req, res, next) {
  try {
    const { respuesta, motivo } = req.body || {};
    if (!['aceptar', 'declinar'].includes(respuesta)) {
      return res.status(400).json({ error: true, mensaje: "respuesta debe ser 'aceptar' o 'declinar'" });
    }

    const riesgo = await riesgosQueries.obtenerRiesgoPorId(req.params.id);
    if (!riesgo) {
      return res.status(404).json({ error: true, mensaje: 'Riesgo no encontrado', codigo: 'NO_ENCONTRADO' });
    }
    if (riesgo.id_responsable !== req.usuario.id) {
      return res.status(403).json({ error: true, mensaje: 'No te propusieron como responsable de este riesgo' });
    }
    if (riesgo.estado_responsable !== 'pendiente') {
      return res.status(409).json({ error: true, mensaje: 'Esta asignación ya fue respondida.' });
    }

    const acepta = respuesta === 'aceptar';
    const resuelto = await riesgosQueries.responderAsignacion({
      idRiesgo: req.params.id, acepta, motivoRechazo: motivo,
    });
    if (!resuelto) {
      return res.status(409).json({ error: true, mensaje: 'Esta asignación ya fue respondida.' });
    }

    if (resuelto.id_asignado_por) {
      const nombreEntidad = await nombreEntidadRiesgo(resuelto.entidad_tipo, resuelto.entidad_id);
      const base = acepta
        ? `${req.usuario.nombre_completo} aceptó ser responsable del riesgo "${resuelto.titulo}" en ${describirEntidad(resuelto.entidad_tipo, nombreEntidad)}.`
        : `${req.usuario.nombre_completo} declinó ser responsable del riesgo "${resuelto.titulo}" en ${describirEntidad(resuelto.entidad_tipo, nombreEntidad)}.`;
      await crearNotificacion({
        tipo: 'RespuestaAsignacionRiesgo',
        mensaje: resuelto.motivo_rechazo ? `${base} ${resuelto.motivo_rechazo}` : base,
        entidadTipo: resuelto.entidad_tipo,
        entidadId: resuelto.entidad_id,
        idUsuario: resuelto.id_asignado_por,
      });
    }

    res.json({ datos: resuelto, mensaje: acepta ? 'Asignación aceptada' : 'Asignación declinada' });
  } catch (err) {
    next(err);
  }
}

// GET /riesgos-asignados-pendientes — bandeja de "te propusieron como
// responsable y no has respondido", de todos los proyectos.
async function listarAsignacionesPendientes(req, res, next) {
  try {
    const pendientes = await riesgosQueries.asignacionesPendientesDe(req.usuario.id);
    res.json({ datos: pendientes, mensaje: 'Asignaciones de riesgo pendientes' });
  } catch (err) {
    next(err);
  }
}

// GET /acciones/:id/riesgos — Listar riesgos de una acción
async function listarPorAccion(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorAccion(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos de acción obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /subacciones/:id/riesgos — Listar riesgos de una subacción
async function listarPorSubaccion(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorSubaccion(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos de subacción obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /tareas/:id/riesgos — Listar riesgos de una tarea
async function listarPorTarea(req, res, next) {
  try {
    const riesgos = await riesgosQueries.obtenerRiesgosPorTarea(req.params.id);
    res.json({ datos: riesgos, mensaje: 'Riesgos de tarea obtenidos' });
  } catch (err) {
    next(err);
  }
}

// DELETE /riesgos/:id — Eliminar un riesgo
async function eliminar(req, res, next) {
  try {
    const resultado = await riesgosQueries.eliminarRiesgo(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'Riesgo eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarPorProyecto, listarPorEtapa, listarPorAccion, listarPorSubaccion, listarPorTarea,
  obtenerPorId, crear, actualizar, eliminar,
  responderAsignacion, listarAsignacionesPendientes,
};
