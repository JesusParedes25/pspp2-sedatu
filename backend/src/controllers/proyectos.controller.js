/**
 * ARCHIVO: proyectos.controller.js
 * PROPÓSITO: Manejar las peticiones HTTP de proyectos y proyecto_dgs.
 *
 * MINI-CLASE: Controllers en Express
 * ─────────────────────────────────────────────────────────────────
 * Un controller es la función que recibe la petición HTTP (req),
 * ejecuta la lógica de negocio (llamando a queries), y devuelve
 * la respuesta (res). Cada función corresponde a un endpoint de la
 * API. El controller NO contiene SQL directo — eso vive en queries/.
 * Tampoco maneja rutas — eso vive en routes/. Esta separación
 * facilita encontrar y modificar cada parte independientemente.
 * ─────────────────────────────────────────────────────────────────
 */
const proyectosQueries = require('../db/queries/proyectos.queries');
const indicadoresQueries = require('../db/queries/indicadores.queries');

// GET /proyectos — Listar proyectos con filtros y paginación
async function listar(req, res, next) {
  try {
    const { estado, tipo, dg, busqueda, pagina, limite } = req.query;

    const resultado = await proyectosQueries.listarProyectos({
      estado,
      tipo,
      idDg: dg,
      busqueda,
      pagina: parseInt(pagina) || 1,
      limite: parseInt(limite) || 12
    });

    res.json({ datos: resultado, mensaje: 'Proyectos obtenidos' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id — Obtener un proyecto con todos sus datos
async function obtenerPorId(req, res, next) {
  try {
    const proyecto = await proyectosQueries.obtenerProyectoPorId(req.params.id);

    if (!proyecto) {
      return res.status(404).json({
        error: true,
        mensaje: 'Proyecto no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    // Obtener datos complementarios en paralelo
    const [dgs, etiquetas, indicadores] = await Promise.all([
      proyectosQueries.obtenerDGsProyecto(proyecto.id),
      proyectosQueries.obtenerEtiquetas(proyecto.id),
      indicadoresQueries.listarPorProyecto(proyecto.id)
    ]);

    res.json({
      datos: { ...proyecto, dgs, etiquetas, indicadores },
      mensaje: 'Proyecto obtenido'
    });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos — Crear un nuevo proyecto
async function crear(req, res, next) {
  try {
    const proyecto = await proyectosQueries.crearProyecto(req.body, req.usuario.id);

    res.status(201).json({
      datos: proyecto,
      mensaje: 'Proyecto creado exitosamente'
    });
  } catch (err) {
    next(err);
  }
}

// PUT /proyectos/:id — Actualizar un proyecto
async function actualizar(req, res, next) {
  try {
    const proyecto = await proyectosQueries.actualizarProyecto(req.params.id, req.body);

    if (!proyecto) {
      return res.status(404).json({
        error: true,
        mensaje: 'Proyecto no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: proyecto, mensaje: 'Proyecto actualizado' });
  } catch (err) {
    next(err);
  }
}

// DELETE /proyectos/:id — Soft delete
async function eliminar(req, res, next) {
  try {
    const resultado = await proyectosQueries.eliminarProyecto(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Proyecto no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'Proyecto eliminado' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/dgs — Obtener DGs participantes
async function obtenerDGs(req, res, next) {
  try {
    const dgs = await proyectosQueries.obtenerDGsProyecto(req.params.id);
    res.json({ datos: dgs, mensaje: 'DGs del proyecto obtenidas' });
  } catch (err) {
    next(err);
  }
}

// POST /proyectos/:id/dgs — Agregar DG colaboradora
async function agregarDG(req, res, next) {
  try {
    const resultado = await proyectosQueries.agregarDGProyecto(req.params.id, req.body);

    if (!resultado) {
      return res.status(409).json({
        error: true,
        mensaje: 'La DG ya participa en este proyecto',
        codigo: 'DG_YA_EXISTE'
      });
    }

    res.status(201).json({ datos: resultado, mensaje: 'DG agregada al proyecto' });
  } catch (err) {
    next(err);
  }
}

// DELETE /proyectos/:id/dgs/:dg_id — Eliminar DG colaboradora
async function eliminarDG(req, res, next) {
  try {
    const resultado = await proyectosQueries.eliminarDGProyecto(req.params.id, req.params.dg_id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'DG no encontrada en el proyecto o es la DG líder',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'DG eliminada del proyecto' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, obtenerDGs, agregarDG, eliminarDG };
