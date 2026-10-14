/**
 * ARCHIVO: permisos.queries.js
 * PROPÓSITO: Responder, para un proyecto y un usuario, en qué nodos
 *            concretos puede capturar — para que la interfaz muestre
 *            editable exactamente lo que el servidor va a aceptar.
 *
 * MINI-CLASE: por qué esto tiene que existir
 * ─────────────────────────────────────────────────────────────────
 * Desde que se puede invitar a alguien a una etapa suelta (y no al
 * proyecto entero), "¿puede editar?" dejó de tener una sola respuesta
 * por proyecto: depende del nodo. La interfaz no puede adivinarlo —no
 * conoce nodo_miembros— así que preguntaba a usePermisos, que solo sabe
 * de perfiles y DGs, y terminaba mostrando campos editables que el
 * servidor rechazaba (o al revés, escondiendo los que sí podía tocar).
 *
 * Este módulo devuelve la lista YA EXPANDIDA hacia abajo: si te
 * asignaron una etapa, en la lista vienen también sus acciones y tareas.
 * Así el frontend solo pregunta "¿está este id en la lista?" y no tiene
 * que reimplementar la herencia, que es justo donde las dos capas se
 * desincronizan.
 *
 * Fase 3 (docs/modelo-permisos.md, "estado de consulta en la interfaz"):
 * esta función dejó de reimplementar la escalera a mano con SQL propio
 * (asignación directa + herencia por `while`) y pasó a DELEGAR en
 * `funcionEfectivaPorLotes` — la misma función que ya resuelve, nodo por
 * nodo, exactamente lo que `autorizacion.js` usa para aceptar o rechazar
 * una escritura real. Antes de este cambio existían dos cálculos
 * independientes de "¿puede capturar aquí?" (este archivo y
 * funcion-efectiva.js) que daban el mismo resultado por construcción,
 * pero que podían divergir con el tiempo sin que nada lo avisara — el
 * mismo patrón que ya costó inconsistencias en otros módulos de esta
 * plataforma (el % de avance calculado en 8 lugares, el bono de DG
 * duplicado). Con esta delegación, el candado de Fase 3 (y cualquier
 * otro consumidor de `nodos_editables`) sale de la MISMA fuente que el
 * servidor usa para rechazar la escritura, no de una copia.
 * ─────────────────────────────────────────────────────────────────
 */
const { funcionEfectivaPorLotes, alcanza } = require('../../utils/funcion-efectiva');

// Nodos del proyecto en los que el usuario puede capturar (peldaño
// 'captura' o superior), expandidos a sus descendientes por herencia —
// la herencia y la resolución de vías (invitación directa, responsable
// de nodo, bono de DG, etc.) las resuelve funcionEfectivaPorLotes().
// Devuelve { etapa: [...ids], accion: [...], tarea: [...] }.
async function nodosEditablesUsuario(proyectoId, usuario, db) {
  const vacio = { etapa: [], accion: [], tarea: [] };
  if (!proyectoId || !usuario) return vacio;

  const resultado = await funcionEfectivaPorLotes(usuario, proyectoId, db);
  const idsConCaptura = (porNodo) =>
    Object.entries(porNodo)
      .filter(([, candidato]) => alcanza(candidato, 'captura'))
      .map(([id]) => id);

  return {
    etapa: idsConCaptura(resultado.etapa),
    accion: idsConCaptura(resultado.accion),
    tarea: idsConCaptura(resultado.tarea),
  };
}

module.exports = { nodosEditablesUsuario };
