/**
 * ARCHIVO: indicadores.controller.js
 * PROPÓSITO: Controlador REST para indicadores de proyecto.
 *
 * MINI-CLASE: Controllers y la capa de transporte
 * ─────────────────────────────────────────────────────────────────
 * Un controller recibe la petición HTTP (req), extrae los datos,
 * llama a la capa de queries (lógica de datos), y devuelve la
 * respuesta HTTP (res). No contiene lógica de negocio compleja
 * ni SQL directo — eso vive en las queries.
 * ─────────────────────────────────────────────────────────────────
 */
const indicadoresQueries = require('../db/queries/indicadores.queries');

// GET /proyectos/:id/indicadores — solo los de nivel proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarPorProyecto(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id/indicadores — indicadores propios de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarPorEtapa(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/indicadores/todos — proyecto + etapas
async function listarTodosPorProyecto(req, res, next) {
  try {
    const indicadores = await indicadoresQueries.listarTodosPorProyecto(req.params.id);
    res.json({ datos: indicadores });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos/:id/indicadores
async function crear(req, res, next) {
  try {
    const indicador = await indicadoresQueries.crear(req.params.id, req.body);
    res.status(201).json({ datos: indicador, mensaje: 'Indicador creado' });
  } catch (err) {
    next(err);
  }
}

// PUT /indicadores/:id
async function actualizar(req, res, next) {
  try {
    const indicador = await indicadoresQueries.actualizar(req.params.id, req.body);
    if (!indicador) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: indicador, mensaje: 'Indicador actualizado' });
  } catch (err) {
    next(err);
  }
}

// DELETE /indicadores/:id?confirmar=true
async function eliminar(req, res, next) {
  try {
    const pool = require('../db/pool');
    const id = req.params.id;

    // Count linked items
    const countAport = await pool.query(
      'SELECT COUNT(*)::int AS n FROM indicador_aportaciones WHERE id_indicador = $1', [id]
    );
    const countMetas = await pool.query(
      'SELECT COUNT(*)::int AS n FROM indicador_metas_anuales WHERE id_indicador = $1', [id]
    );
    const nAport = countAport.rows[0].n;
    const nMetas = countMetas.rows[0].n;

    // If has linked items and no confirm, return warning
    if ((nAport > 0 || nMetas > 0) && req.query.confirmar !== 'true') {
      return res.json({
        requiere_confirmacion: true,
        n_aportaciones: nAport,
        n_metas_anuales: nMetas,
        mensaje: `Este indicador tiene ${nAport} aportaciones y ${nMetas} metas anuales ligadas; se eliminarán también.`
      });
    }

    // Hard delete so FK ON DELETE CASCADE cleans up aportaciones + metas
    if (nAport > 0 || nMetas > 0) {
      const del = await pool.query('DELETE FROM indicadores WHERE id = $1 RETURNING id', [id]);
      if (!del.rows[0]) return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    } else {
      const resultado = await indicadoresQueries.eliminar(id);
      if (!resultado) return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ mensaje: 'Indicador eliminado' });
  } catch (err) {
    next(err);
  }
}

// GET /indicadores/:id/resumen-aportaciones — meta, total aportado, disponible
async function resumenAportaciones(req, res, next) {
  try {
    const resumen = await indicadoresQueries.obtenerResumenAportaciones(req.params.id);
    if (!resumen) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: resumen });
  } catch (err) {
    next(err);
  }
}

// GET /indicadores/publicos — para plataforma externa
async function listarPublicables(req, res, next) {
  try {
    const filtros = {};
    if (req.query.id_dg) filtros.id_dg = req.query.id_dg;
    const datos = await indicadoresQueries.listarPublicables(filtros);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// PATCH /indicadores/:id/publicar — toggle es_publicable
async function togglePublicable(req, res, next) {
  try {
    const { es_publicable } = req.body;
    const pool = require('../db/pool');
    const result = await pool.query(
      'UPDATE indicadores SET es_publicable = $1, updated_at = NOW() WHERE id = $2 RETURNING id, es_publicable',
      [!!es_publicable, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: result.rows[0], mensaje: es_publicable ? 'Indicador publicado' : 'Indicador despublicado' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/indicadores/resumen — con valores realizados y warnings
async function resumenConValores(req, res, next) {
  try {
    const aportacionesQueries = require('../db/queries/aportaciones.queries');
    const indicadores = await indicadoresQueries.listarPorProyecto(req.params.id);

    const resultado = [];
    for (const ind of indicadores) {
      const { total, porAnio } = await aportacionesQueries.calcularValorRealizado(ind.id);
      const warnings = await aportacionesQueries.detectarDobleConteo(ind.id);
      resultado.push({
        ...ind,
        valor_realizado_total: total,
        valor_realizado_por_anio: porAnio,
        warnings
      });
    }

    res.json({ datos: resultado });
  } catch (err) { next(err); }
}

module.exports = { listarPorProyecto, listarPorEtapa, listarTodosPorProyecto, crear, actualizar, eliminar, resumenAportaciones, listarPublicables, togglePublicable, resumenConValores };
