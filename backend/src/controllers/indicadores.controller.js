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
const inicioQueries = require('../db/queries/inicio.queries');
const { resolverProyectoIdsFiltro } = require('../utils/alcanceProyectos');

// GET /indicadores/mios?proyecto_ids=id1,id2&cartera_id=xxx — todos los
// indicadores de los proyectos donde participa el usuario (superadmin/
// ejecutivo ven todos), agregados igual que en Tablero — mismo query,
// mismo criterio de alcance/filtro (resolverProyectoIdsFiltro), para que
// el número de un indicador sea el mismo sin importar si se ve aquí o
// en el Tablero.
async function listarMios(req, res, next) {
  try {
    const proyectoIds = await resolverProyectoIdsFiltro(req.usuario, req.query);
    if (!proyectoIds || proyectoIds.length === 0) return res.json({ datos: [] });
    const datos = await inicioQueries.obtenerIndicadoresAgregados(proyectoIds);
    res.json({ datos });
  } catch (err) {
    next(err);
  }
}

// GET /indicadores/:id — un solo indicador, con proyecto/DG dueño y
// sus metas/periodos — usado por la pantalla de detalle del módulo.
async function obtenerPorId(req, res, next) {
  try {
    const indicador = await indicadoresQueries.obtenerPorId(req.params.id);
    if (!indicador) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    res.json({ datos: indicador });
  } catch (err) {
    next(err);
  }
}

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
    const indicador = await indicadoresQueries.crear(req.params.id, req.body, null, req.usuario?.id);
    res.status(201).json({ datos: indicador, mensaje: 'Indicador creado' });
  } catch (err) {
    next(err);
  }
}

// PUT /indicadores/:id
async function actualizar(req, res, next) {
  try {
    const indicador = await indicadoresQueries.actualizar(req.params.id, req.body, req.usuario?.id);
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
    const countCategorias = await pool.query(
      'SELECT COUNT(*)::int AS n FROM indicador_categorias WHERE id_indicador = $1', [id]
    );
    const nAport = countAport.rows[0].n;
    const nMetas = countMetas.rows[0].n;
    const nCategorias = countCategorias.rows[0].n;

    // If has linked items and no confirm, return warning
    if ((nAport > 0 || nMetas > 0 || nCategorias > 0) && req.query.confirmar !== 'true') {
      return res.json({
        requiere_confirmacion: true,
        n_aportaciones: nAport,
        n_metas_anuales: nMetas,
        n_categorias: nCategorias,
        mensaje: `Este indicador tiene ${nAport} aportaciones, ${nMetas} metas anuales y ${nCategorias} categorías ligadas; se eliminarán también.`
      });
    }

    // Hard delete so FK ON DELETE CASCADE cleans up aportaciones + metas + categorías
    if (nAport > 0 || nMetas > 0 || nCategorias > 0) {
      // Capturar id_proyecto/nombre ANTES de borrar — la bitácora
      // (actividad_log.entidad_id) no tiene FK, así que registrar
      // después del hard-delete no rompe nada, pero el mensaje sí
      // necesita el nombre mientras la fila todavía existe.
      const { rows: [previo] } = await pool.query('SELECT id_proyecto, nombre FROM indicadores WHERE id = $1', [id]);
      const del = await pool.query('DELETE FROM indicadores WHERE id = $1 RETURNING id', [id]);
      if (!del.rows[0]) return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
      if (previo) {
        const { registrarActividad } = require('../utils/actividad-log');
        await registrarActividad({
          id_proyecto: previo.id_proyecto,
          id_usuario: req.usuario?.id || null,
          tipo: 'indicador',
          titulo: `Indicador "${previo.nombre}" eliminado`,
          entidad_tipo: 'Indicador',
          entidad_id: id,
        });
      }
    } else {
      const resultado = await indicadoresQueries.eliminar(id, req.usuario?.id);
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

// PATCH /indicadores/:id/valor — captura manual directa (modo_calculo = 'manual')
async function establecerValor(req, res, next) {
  try {
    const pool = require('../db/pool');
    const { rows: [ind] } = await pool.query('SELECT modo_calculo FROM indicadores WHERE id = $1', [req.params.id]);
    if (!ind) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado' });
    }
    if (ind.modo_calculo !== 'manual') {
      return res.status(409).json({
        error: true,
        mensaje: 'Este indicador se calcula automáticamente — no se puede editar su valor a mano',
        codigo: 'NO_ES_MANUAL',
      });
    }
    const { valor, id_periodo, id_categoria } = req.body;
    if (valor === undefined || valor === null || valor === '') {
      return res.status(400).json({ error: true, mensaje: 'Falta el valor', codigo: 'CAMPOS_REQUERIDOS' });
    }
    const datos = await indicadoresQueries.establecerValorManual(req.params.id, {
      valor: parseFloat(valor),
      id_periodo: id_periodo || null,
      id_categoria: id_categoria || null,
    }, req.usuario?.id);
    res.json({ datos, mensaje: 'Valor guardado' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: true, mensaje: err.message });
    }
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

module.exports = { obtenerPorId, listarPorProyecto, listarPorEtapa, listarTodosPorProyecto, crear, actualizar, eliminar, resumenAportaciones, listarPublicables, togglePublicable, resumenConValores, establecerValor, listarMios };
