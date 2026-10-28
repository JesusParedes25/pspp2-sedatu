/**
 * ARCHIVO: catalogo-indicadores.controller.js
 * PROPÓSITO: API del catálogo de indicadores.
 *
 * MINI-CLASE: quién puede qué
 * ─────────────────────────────────────────────────────────────────
 * Leer el catálogo lo puede hacer cualquier usuario autenticado: sin
 * eso no podría elegir indicadores al capturar su proyecto.
 * Crear también, y a propósito — si agregar un indicador que falta
 * exigiera pedírselo a un administrador, la gente volvería a
 * teclearlo suelto y el catálogo quedaría desactualizado desde el
 * primer día. Queda registrado quién lo creó.
 * Editar, dar de baja/reactivar y eliminar son de superadmin: son las
 * operaciones que afectan a proyectos ajenos, o que son irreversibles
 * (ver el guard en las rutas).
 * ─────────────────────────────────────────────────────────────────
 */
const catalogoQueries = require('../db/queries/catalogo-indicadores.queries');
const { notificarSuperadmins } = require('../utils/notificaciones');

async function listar(req, res, next) {
  try {
    // Solo un superadmin necesita ver los retirados (para reactivarlos);
    // al resto ofrecerle indicadores dados de baja sería un error.
    const incluirInactivos = req.query.incluir_inactivos === 'true'
      && req.usuario?.rol === 'superadmin';

    const { datos, total } = await catalogoQueries.listar({
      busqueda: req.query.busqueda || undefined,
      incluirInactivos,
      instrumento: req.query.instrumento || undefined,
      producto: req.query.producto || undefined,
      objetivo: req.query.objetivo || undefined,
      estrategia: req.query.estrategia || undefined,
      area: req.query.area || undefined,
      pagina: parseInt(req.query.pagina) || 1,
      limite: parseInt(req.query.limite) || 50,
    });
    res.json({ datos, total });
  } catch (err) { next(err); }
}

async function listarProductos(req, res, next) {
  try {
    const datos = await catalogoQueries.listarProductos(req.query.busqueda || undefined, req.query.instrumento || undefined);
    res.json({ datos });
  } catch (err) { next(err); }
}

async function listarLineasAccion(req, res, next) {
  try {
    const datos = await catalogoQueries.listarLineasAccion();
    res.json({ datos });
  } catch (err) { next(err); }
}

async function listarAreas(req, res, next) {
  try {
    const datos = await catalogoQueries.listarAreas();
    res.json({ datos });
  } catch (err) { next(err); }
}

async function titulosPsedatu(req, res, next) {
  try {
    const datos = await catalogoQueries.obtenerTitulosPsedatu();
    res.json({ datos });
  } catch (err) { next(err); }
}

async function buscarSimilares(req, res, next) {
  try {
    const datos = await catalogoQueries.buscarSimilares(req.query.q, req.query.excluir_id || null);
    res.json({ datos });
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const datos = await catalogoQueries.obtener(req.params.id);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos });
  } catch (err) { next(err); }
}

async function uso(req, res, next) {
  try {
    const datos = await catalogoQueries.uso(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

async function nodosVinculados(req, res, next) {
  try {
    const datos = await catalogoQueries.obtenerNodosVinculados(req.params.id);
    res.json({ datos });
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    if (req.usuario?.rol === 'externo') {
      return res.status(403).json({ error: true, mensaje: 'No tienes permisos para agregar indicadores', codigo: 'FORBIDDEN' });
    }
    const datos = await catalogoQueries.crear(req.body, req.usuario.id);
    res.status(201).json({ datos, mensaje: 'Indicador agregado al catálogo' });
  } catch (err) {
    // El duplicado no es un fallo del sistema: el cliente puede usar el
    // que ya existe, así que se devuelve cuál es.
    if (err.codigo === 'DUPLICADO') {
      return res.status(409).json({ error: true, mensaje: err.mensaje || err.message, codigo: 'DUPLICADO', existente: err.existente });
    }
    next(err);
  }
}

// Para quien no puede dar de alta (rol 'externo', ver crear() arriba):
// en vez de un 403 sin salida, manda un aviso a los superadmin con el
// nombre que necesita — mismo sistema de notificaciones que usa el resto
// de la plataforma. No queda como un mensaje sin acción posible: el
// aviso lleva el nombre pedido y quién lo pidió, y quien lo recibe puede
// ir directo al catálogo a darlo de alta.
async function solicitar(req, res, next) {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) {
      return res.status(400).json({ error: true, mensaje: 'Escribe el nombre del indicador que necesitas', codigo: 'CAMPOS_REQUERIDOS' });
    }
    const motivo = (req.body?.motivo || '').trim();
    const quien = req.usuario?.nombre_completo || 'Un usuario';
    const mensaje = `${quien} solicita agregar el indicador "${nombre}" al catálogo.`
      + (motivo ? ` Motivo: ${motivo}` : '');
    await notificarSuperadmins('SolicitudIndicador', mensaje);
    res.status(201).json({ mensaje: 'Solicitud enviada a los administradores' });
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const datos = await catalogoQueries.actualizar(req.params.id, req.body);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos, mensaje: 'Indicador actualizado' });
  } catch (err) {
    if (err.codigo === 'DUPLICADO') {
      return res.status(409).json({ error: true, mensaje: err.mensaje || err.message, codigo: 'DUPLICADO', existente: err.existente });
    }
    next(err);
  }
}

async function cambiarActivo(req, res, next) {
  try {
    const activo = req.body?.activo !== false;
    const datos = await catalogoQueries.cambiarActivo(req.params.id, activo);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos, mensaje: activo ? 'Indicador reactivado' : 'Indicador dado de baja' });
  } catch (err) { next(err); }
}

// DELETE /catalogo-indicadores/:id — borrado real, distinto de
// cambiarActivo (dar de baja). Solo posible si ningún proyecto usa esta
// entrada todavía; catalogoQueries.eliminar ya valida eso y lanza un
// error tipado (EN_USO, 409) en vez de borrar.
async function eliminar(req, res, next) {
  try {
    const datos = await catalogoQueries.eliminar(req.params.id);
    if (!datos) {
      return res.status(404).json({ error: true, mensaje: 'Indicador no encontrado en el catálogo', codigo: 'NO_ENCONTRADO' });
    }
    res.json({ datos, mensaje: `"${datos.nombre}" se eliminó del catálogo` });
  } catch (err) {
    if (err.codigo === 'EN_USO') {
      return res.status(409).json({ error: true, mensaje: err.message, codigo: err.codigo, usos: err.usos });
    }
    next(err);
  }
}

module.exports = { listar, obtener, uso, nodosVinculados, crear, solicitar, actualizar, cambiarActivo, eliminar, buscarSimilares, listarProductos, listarLineasAccion, listarAreas, titulosPsedatu };
