/**
 * ARCHIVO: condicion-actividades-por-completar.js
 * PROPÓSITO: Fuente única de verdad para "¿cuántas acciones de este
 *            proyecto faltan por completar?" — la misma pregunta se
 *            respondía por separado en inicio.queries.js (Tablero,
 *            excluía subacciones) y en proyectos.queries.js (Listado de
 *            proyectos, no las excluía): mismo nombre de columna
 *            (`acciones_pendientes`), dos definiciones. Hoy numéricamente
 *            es un no-op (producción tiene 0 subacciones — ver Bloque 5,
 *            "Cierre del modelo de urgencia"), pero es el momento barato
 *            de unificarlas antes de que diverjan de verdad, igual que
 *            ya se hizo para riesgos en condicion-riesgo.js.
 *
 * Se unifica al criterio del Tablero (excluye subacciones): cuenta solo
 * acciones de nivel raíz, que es lo que el árbol muestra sin expandir —
 * una subacción ya "pertenece" visualmente a su acción contenedora.
 */

// proyectoIdExpr es la expresión SQL que da el id del proyecto en la
// query que llama a esta función — 'p.id' cuando ya hay un JOIN a
// proyectos, o '$1' (u otro placeholder) cuando el id llega como
// parámetro suelto.
function condicionAccionesPorCompletar(proyectoIdExpr, aliasAccion = 'a') {
  return `(
    SELECT COUNT(*) FROM acciones ${aliasAccion}
    WHERE ${aliasAccion}.id_proyecto = ${proyectoIdExpr}
      AND ${aliasAccion}.id_accion_padre IS NULL
      AND ${aliasAccion}.estado NOT IN ('Completada', 'Cancelada')
  )::int`;
}

module.exports = { condicionAccionesPorCompletar };
