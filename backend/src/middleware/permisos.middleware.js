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
const { puedeEditarNodo, puedeEditarContenidoProyecto } = require('../utils/autorizacion');

const MENSAJE = 'No tienes permisos para capturar en este proyecto. '
  + 'Solicítalo a su responsable o a la Dirección General que lo lidera.';

function rechazar(res) {
  return res.status(403).json({ error: true, mensaje: MENSAJE, codigo: 'NO_AUTORIZADO' });
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

module.exports = { exigirEdicionNodo, exigirEdicionProyecto };
