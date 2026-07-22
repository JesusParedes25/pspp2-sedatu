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
const miembrosQueries = require('../db/queries/miembros.queries');
const pool = require('../db/pool');
const { cambiarEstado: cambiarEstadoUtil } = require('../utils/validaciones-estado');
const { recalcularProyecto } = require('../utils/recalculos');
const { Client: MinioClient } = require('minio');
const { v4: uuidv4 } = require('uuid');

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_USER,
  secretKey: process.env.MINIO_PASSWORD,
});
const BUCKET = process.env.MINIO_BUCKET || 'pspp-evidencias';

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

    // Convertir path de MinIO a URL proxy del backend
    for (const p of resultado.proyectos) {
      if (p.imagen_url) {
        p.imagen_url = `/api/v1/proyectos/${p.id}/imagen`;
      }
    }

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
    const [dgs, etiquetas, indicadores, rolUsuarioActual] = await Promise.all([
      proyectosQueries.obtenerDGsProyecto(proyecto.id),
      proyectosQueries.obtenerEtiquetas(proyecto.id),
      indicadoresQueries.listarPorProyecto(proyecto.id),
      miembrosQueries.obtenerRolUsuario(proyecto.id, req.usuario.id)
    ]);

    // Convertir path de MinIO a URL proxy del backend
    if (proyecto.imagen_url) {
      proyecto.imagen_url = `/api/v1/proyectos/${proyecto.id}/imagen`;
    }

    res.json({
      datos: { ...proyecto, dgs, etiquetas, indicadores, rol_usuario_actual: rolUsuarioActual },
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
// Si el body incluye 'estado', delega al módulo compartido validaciones-estado.
async function actualizar(req, res, next) {
  const { estado, motivo_bloqueo, nota_resolucion, ...otrosDatos } = req.body;
  const proyectoId = req.params.id;
  const idUsuario = req.usuario?.id;

  if (estado) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await cambiarEstadoUtil(
        'Proyecto', proyectoId, estado,
        { motivoBloqueo: motivo_bloqueo, notaResolucion: nota_resolucion, idUsuario },
        client
      );

      // Actualizar campos no-estado si los hay
      if (Object.keys(otrosDatos).length > 0) {
        await proyectosQueries.actualizarProyecto(proyectoId, otrosDatos, client);
      }

      await recalcularProyecto(proyectoId, client);
      await client.query('COMMIT');

      const actualizado = await proyectosQueries.obtenerProyectoPorId(proyectoId);
      return res.json({ datos: actualizado, mensaje: 'Proyecto actualizado' });
    } catch (err) {
      await client.query('ROLLBACK');
      const status = err.statusCode || 500;
      if (status < 500) {
        return res.status(status).json({ error: true, mensaje: err.message, codigo: 'VALIDACION_NEGOCIO' });
      }
      return next(err);
    } finally {
      client.release();
    }
  }

  // Sin cambio de estado
  try {
    const proyecto = await proyectosQueries.actualizarProyecto(proyectoId, otrosDatos);
    if (!proyecto) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos: proyecto, mensaje: 'Proyecto actualizado' });
  } catch (err) {
    next(err);
  }
}

// Autorización de borrado: superadmin/ejecutivo siempre; para el resto,
// solo quien creó el proyecto o es su responsable (rol 'responsable' en
// proyecto_usuarios). Antes este endpoint no tenía NINGÚN chequeo server-side
// — cualquier usuario autenticado podía borrar cualquier proyecto por API
// directa, el botón simplemente no existía en la UI.
async function puedeEliminarProyecto(proyectoId, usuario) {
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return true;
  const { rows } = await pool.query('SELECT id_creador FROM proyectos WHERE id = $1', [proyectoId]);
  if (rows[0]?.id_creador === usuario.id) return true;
  const rolProyecto = await miembrosQueries.obtenerRolUsuario(proyectoId, usuario.id);
  return rolProyecto === 'responsable';
}

// DELETE /proyectos/:id — Soft delete (deleted_at = NOW()); se purga
// automáticamente a los 30 días (ver utils/purgarProyectos.js) y hasta
// entonces un superadmin puede restaurarlo desde Administración.
async function eliminar(req, res, next) {
  try {
    const autorizado = await puedeEliminarProyecto(req.params.id, req.usuario);
    if (!autorizado) {
      return res.status(403).json({
        error: true,
        mensaje: 'Solo el responsable, el creador del proyecto o un superadmin/ejecutivo pueden eliminarlo.',
        codigo: 'NO_AUTORIZADO'
      });
    }

    const resultado = await proyectosQueries.eliminarProyecto(req.params.id);

    if (!resultado) {
      return res.status(404).json({
        error: true,
        mensaje: 'Proyecto no encontrado',
        codigo: 'NO_ENCONTRADO'
      });
    }

    res.json({ datos: resultado, mensaje: 'Proyecto eliminado — se puede restaurar dentro de los próximos 30 días.' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/eliminados — Papelera (solo superadmin, ver middleware en routes)
async function listarEliminados(req, res, next) {
  try {
    const datos = await proyectosQueries.obtenerProyectosEliminados();
    res.json({ datos, mensaje: 'Proyectos eliminados obtenidos' });
  } catch (err) { next(err); }
}

// PATCH /proyectos/:id/restaurar — Solo superadmin
async function restaurar(req, res, next) {
  try {
    const resultado = await proyectosQueries.restaurarProyecto(req.params.id);
    if (!resultado) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado en la papelera', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos: resultado, mensaje: 'Proyecto restaurado' });
  } catch (err) { next(err); }
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

// POST /proyectos/:id/imagen — Subir imagen de encabezado a MinIO
async function subirImagen(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: true, mensaje: 'No se proporcionó imagen', codigo: 'ARCHIVO_REQUERIDO' });
    }
    const archivo = req.file;
    const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
    const rutaMinio = `proyectos/${req.params.id}/portada/${nombreUnico}`;

    await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, {
      'Content-Type': archivo.mimetype,
    });

    // Guardar solo el path del objeto en MinIO (nunca URLs pre-firmadas)
    const resultado = await proyectosQueries.actualizarImagenProyecto(req.params.id, rutaMinio);
    if (!resultado) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado', codigo: 'NO_ENCONTRADO' });
    }

    // Devolver URL proxy del backend
    const imagenUrl = `/api/v1/proyectos/${req.params.id}/imagen`;
    res.json({ datos: { imagen_url: imagenUrl }, mensaje: 'Imagen subida exitosamente' });
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

// GET /proyectos/:id/etiquetas — Obtener etiquetas de un proyecto
async function obtenerEtiquetas(req, res, next) {
  try {
    const etiquetas = await proyectosQueries.obtenerEtiquetas(req.params.id);
    res.json({ datos: etiquetas, mensaje: 'Etiquetas obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/imagen — Proxy: sirve la imagen desde MinIO al navegador
async function servirImagen(req, res, next) {
  try {
    const proyecto = await proyectosQueries.obtenerProyectoPorId(req.params.id);
    if (!proyecto || !proyecto.imagen_url) {
      return res.status(404).json({ error: true, mensaje: 'Imagen no encontrada' });
    }

    const rutaObjeto = proyecto.imagen_url;
    const stat = await minioClient.statObject(BUCKET, rutaObjeto);
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'image/png');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = await minioClient.getObject(BUCKET, rutaObjeto);
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return res.status(404).json({ error: true, mensaje: 'Imagen no encontrada en storage' });
    }
    next(err);
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, listarEliminados, restaurar, obtenerDGs, agregarDG, eliminarDG, obtenerEtiquetas, subirImagen, servirImagen };
