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
const miembrosQueries = require('../db/queries/miembros.queries');
const { resolverProyectoIdsFiltro } = require('../utils/alcanceProyectos');

const ROLES_CON_TOTAL_PLATAFORMA = ['superadmin', 'ejecutivo'];

// GET /indicadores/mios?proyecto_ids=id1,id2&cartera_id=xxx
//
// Bloque 5 del encargo: esta pantalla se anuncia como "los indicadores
// de TUS proyectos" — para superadmin/ejecutivo, cuyo alcance normal
// (resolverProyectoIdsFiltro) es "todos los proyectos de la plataforma",
// eso la inundaba con cientos de proyectos ajenos. Aquí la lista se
// acota siempre a la participación real del usuario
// (miembrosQueries.obtenerProyectosUsuario) — para el resto de roles
// coincide con su alcance normal, así que no cambia nada.
//
// Por separado, solo para superadmin/ejecutivo, cada entrada que
// comparta id_catalogo con algo medido en OTROS proyectos de su alcance
// completo (más allá de los suyos) trae también `total_plataforma`/
// `proyectos_plataforma` — el total real, para quien necesita reportar
// hacia arriba. Mismo criterio de alcance de siempre
// (resolverProyectoIdsFiltro, sin filtro base = su alcance completo), no
// una regla de visibilidad nueva.
async function listarMios(req, res, next) {
  try {
    // El recorte a "participación real" solo aplica a superadmin/
    // ejecutivo (cuyo alcance normal ya es "todos los proyectos", ver
    // mini-clase arriba) — para cualquier otro rol se deja el alcance de
    // siempre (direccion conserva su bono de DG; enlace, lo de siempre),
    // pasando null para que resolverProyectoIdsFiltro use su default.
    const esRolAmplio = ROLES_CON_TOTAL_PLATAFORMA.includes(req.usuario.rol);
    const basePersonal = esRolAmplio ? await miembrosQueries.obtenerProyectosUsuario(req.usuario.id) : null;
    const proyectoIdsPersonales = await resolverProyectoIdsFiltro(req.usuario, req.query, basePersonal);
    if (!proyectoIdsPersonales || proyectoIdsPersonales.length === 0) return res.json({ datos: [] });
    const datos = await inicioQueries.obtenerIndicadoresAgregados(proyectoIdsPersonales);

    const idsCatalogo = [...new Set(datos.map(d => d.id_catalogo).filter(Boolean))];
    if (esRolAmplio && idsCatalogo.length > 0) {
      const proyectoIdsAlcance = await resolverProyectoIdsFiltro(req.usuario, req.query);
      const todosLosDatos = await inicioQueries.obtenerIndicadoresAgregados(proyectoIdsAlcance);
      const porCatalogo = {};
      for (const d of todosLosDatos) {
        if (!d.id_catalogo) continue;
        const acc = porCatalogo[d.id_catalogo] || { total: 0, proyectos: new Set() };
        // Mismo criterio que agruparPorCatalogo/TarjetaIndicadorGrupo en el
        // frontend: un porcentaje no se combina entre proyectos, así que
        // no se suma — solo se cuenta cuántos proyectos más lo miden.
        if (d.unidad !== 'Porcentaje') acc.total += d.valor_actual;
        acc.proyectos.add(d.proyecto_id);
        porCatalogo[d.id_catalogo] = acc;
      }
      // Cuántos de los proyectos PERSONALES ya miden cada entrada del
      // catálogo — para comparar contra el total de la plataforma y
      // anotar el dato solo cuando de verdad hay algo más allá de lo
      // que ya se ve en esta misma pantalla.
      const proyectosPersonalesPorCatalogo = {};
      for (const d of datos) {
        if (!d.id_catalogo) continue;
        proyectosPersonalesPorCatalogo[d.id_catalogo] = (proyectosPersonalesPorCatalogo[d.id_catalogo] || 0) + 1;
      }
      for (const d of datos) {
        const agg = d.id_catalogo && porCatalogo[d.id_catalogo];
        if (agg && agg.proyectos.size > (proyectosPersonalesPorCatalogo[d.id_catalogo] || 0)) {
          d.total_plataforma = agg.total;
          d.proyectos_plataforma = agg.proyectos.size;
        }
      }
    }

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

module.exports = { obtenerPorId, listarPorProyecto, listarPorEtapa, listarTodosPorProyecto, crear, actualizar, eliminar, resumenAportaciones, listarMios };
