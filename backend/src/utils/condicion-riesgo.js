/**
 * ARCHIVO: condicion-riesgo.js
 * PROPÓSITO: Fuente única de verdad para "¿este riesgo pertenece a este
 *            proyecto?" — un riesgo puede vivir en cualquier nivel
 *            (Proyecto, Etapa, Acción, Subacción o Tarea desde la
 *            migración 061), y esa condición se había reescrito a mano
 *            por separado en inicio.queries.js, proyectos.queries.js,
 *            carteras.queries.js y proyectos.stats.queries.js — cada
 *            copia se quedó en el nivel que existía cuando se escribió
 *            (una solo contaba Proyecto, otra Proyecto+Etapa+Acción sin
 *            Subacción ni Tarea...), y por eso el mismo proyecto mostraba
 *            un conteo de riesgos distinto según la pantalla. Un usuario
 *            lo detectó comparando Tablero vs. tarjeta de proyecto vs.
 *            Cartera — la cifra real era 3 y aparecía como 1 en dos de
 *            los tres lugares.
 *
 * No incluye 'Subproyecto' a propósito: ninguna de las copias existentes
 * lo cubría y no hay evidencia de que esté en uso — se unifica al
 * criterio ya vigente (obtenerRiesgosAbiertos en inicio.queries.js), no
 * se inventa uno nuevo.
 */

// proyectoIdExpr es la expresión SQL que da el id del proyecto en la
// query que llama a esta función — 'p.id' cuando ya hay un JOIN a
// proyectos, o '$1' (u otro placeholder) cuando el id llega como
// parámetro suelto.
function condicionRiesgoDeProyecto(proyectoIdExpr, aliasRiesgo = 'r') {
  return `(
    (${aliasRiesgo}.entidad_tipo = 'Proyecto' AND ${aliasRiesgo}.entidad_id = ${proyectoIdExpr})
    OR (${aliasRiesgo}.entidad_tipo = 'Etapa' AND ${aliasRiesgo}.entidad_id IN (
      SELECT id FROM etapas WHERE id_proyecto = ${proyectoIdExpr}
    ))
    OR (${aliasRiesgo}.entidad_tipo IN ('Accion', 'Subaccion') AND ${aliasRiesgo}.entidad_id IN (
      SELECT id FROM acciones WHERE id_proyecto = ${proyectoIdExpr}
    ))
    OR (${aliasRiesgo}.entidad_tipo = 'Tarea' AND ${aliasRiesgo}.entidad_id IN (
      SELECT t.id FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_proyecto = ${proyectoIdExpr}
    ))
  )`;
}

module.exports = { condicionRiesgoDeProyecto };
