/**
 * ARCHIVO: arbolSeleccionable.js
 * PROPÓSITO: Normaliza el árbol que trae `etapasApi.obtenerArbol` (etapas
 *            con `.acciones`, cada una con `.subacciones`/`.tareas`) a la
 *            forma `{ nodo, tipo, hijos }` que usan los selectores de
 *            nodo de la app — un solo lugar para la regla de qué cuenta
 *            como "hijo de una acción" (subacciones = acciones con
 *            `id_accion_padre`, más sus tareas), reusada por
 *            `SelectorNodoArbol.jsx` (selección única, indicadores) y por
 *            el árbol de checkboxes de `GestorUsuariosProyecto.jsx`
 *            (selección múltiple, invitar/asignar participantes).
 */

// Hijos de una etapa: sus acciones de primer nivel (sin id_accion_padre),
// y de cada una sus subacciones (acciones con id_accion_padre — mismo
// `tipo: 'accion'`, la API no las distingue por tipo propio) y tareas.
function hijosDeEtapa(etapa) {
  const acciones = (etapa.acciones || []).filter(a => !a.id_accion_padre);
  return acciones.map(accion => ({
    nodo: accion,
    tipo: 'accion',
    hijos: [
      ...(accion.subacciones || []).map(s => ({ nodo: s, tipo: 'accion', hijos: [] })),
      ...(accion.tareas || []).map(t => ({ nodo: t, tipo: 'tarea', hijos: [] })),
    ],
  }));
}

export function ramasDeEtapas(etapas) {
  return (etapas || []).map(etapa => ({
    nodo: etapa,
    tipo: 'etapa',
    hijos: hijosDeEtapa(etapa),
  }));
}
