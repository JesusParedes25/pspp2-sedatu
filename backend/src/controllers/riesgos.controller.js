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
const { notificarEquipoProyecto } = require('../utils/notificaciones');
const pool = require('../db/pool');

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

    res.status(201).json({ datos: riesgo, mensaje: 'Riesgo registrado exitosamente' });
  } catch (err) {
    next(err);
  }
}

// PUT /riesgos/:id — Actualizar un riesgo
async function actualizar(req, res, next) {
  try {
    const riesgo = await riesgosQueries.actualizarRiesgo(req.params.id, req.body);

    if (!riesgo) {
      return res.status(404).json({
        error: true,
        mensaje: 'Riesgo no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: riesgo, mensaje: 'Riesgo actualizado' });
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
  listarPorProyecto, listarPorEtapa, listarPorAccion, listarPorSubaccion,
  obtenerPorId, crear, actualizar, eliminar
};
