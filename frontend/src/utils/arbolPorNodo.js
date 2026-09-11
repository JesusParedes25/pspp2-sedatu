/**
 * ARCHIVO: arbolPorNodo.js
 * PROPÓSITO: Arma un árbol Etapa › Acción › Tarea a partir de una lista
 *            plana de items (vencidas, riesgos, actividad, estatus
 *            cualitativo) que traen etapa_nombre/accion_nombre/
 *            accion_padre_nombre/tarea_nombre — los mismos campos que ya
 *            devuelven inicio.queries.js y carteras.queries.js. Un item
 *            sin ningún campo de ruta (ej. un riesgo a nivel Proyecto)
 *            queda como hoja suelta en la raíz.
 *
 * Nodos que comparten la misma ruta (dos acciones vencidas de la misma
 * etapa, dos riesgos de la misma acción) se fusionan en un solo nodo del
 * árbol — así se ve de verdad como un árbol y no una lista repetida con
 * el mismo nombre de etapa una y otra vez.
 */
export function construirArbol(items) {
  const raiz = [];
  const sueltos = [];
  const indice = new Map();

  for (const item of items) {
    const pasos = [];
    if (item.etapa_nombre) pasos.push({ tipo: 'etapa', nombre: item.etapa_nombre });
    if (item.accion_padre_nombre) pasos.push({ tipo: 'accion', nombre: item.accion_padre_nombre });
    if (item.accion_nombre) pasos.push({ tipo: 'accion', nombre: item.accion_nombre });
    if (item.tarea_nombre) pasos.push({ tipo: 'tarea', nombre: item.tarea_nombre });

    if (pasos.length === 0) {
      sueltos.push(item);
      continue;
    }

    let nivel = raiz;
    let ruta = '';
    let nodo = null;
    pasos.forEach((paso, i) => {
      ruta += `/${paso.tipo}:${paso.nombre}`;
      nodo = indice.get(ruta);
      if (!nodo) {
        nodo = { tipo: paso.tipo, nombre: paso.nombre, hijos: [], items: [] };
        indice.set(ruta, nodo);
        nivel.push(nodo);
      }
      nivel = nodo.hijos;
      if (i === pasos.length - 1) nodo.items.push(item);
    });
  }

  return { raiz, sueltos };
}
