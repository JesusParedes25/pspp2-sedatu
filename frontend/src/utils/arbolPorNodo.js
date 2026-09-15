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
 *
 * Caso especial — un item que es EL PROPIO nodo de un tramo de ruta (una
 * etapa en una lista de "mis actividades", donde etapa y acción conviven
 * como items del mismo nivel): sin este caso, una etapa caía en `sueltos`
 * (fila suelta, sin conexión visual con sus acciones) Y ADEMÁS su nombre
 * generaba un encabezado de árbol aparte para esas mismas acciones — la
 * etapa terminaba apareciendo dos veces. Aquí se fusiona con su propio
 * nodo del árbol como `nodo.propio`, nunca como fila suelta.
 */
export function construirArbol(items) {
  const raiz = [];
  const sueltos = [];
  const indice = new Map();
  const propios = []; // items que son el nodo propio de un tramo (ver arriba)

  for (const item of items) {
    // Una etapa nunca tiene su propio nombre en etapa_nombre/accion_nombre
    // (esos campos describen a SU contenedor, no a ella misma) — así se
    // detecta sin depender de nada más que ya no traiga el item.
    if (item.tipo === 'etapa') {
      propios.push(item);
      continue;
    }

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

  // Segunda pasada: cada etapa "propia" se adjunta a su nodo del árbol
  // (creándolo, vacío de hijos, si esta etapa no tiene ninguna acción en
  // esta lista) — así una etapa SIEMPRE aparece en su lugar del árbol,
  // nunca como fila suelta desconectada.
  for (const item of propios) {
    const ruta = `/etapa:${item.nombre}`;
    let nodo = indice.get(ruta);
    if (!nodo) {
      nodo = { tipo: 'etapa', nombre: item.nombre, hijos: [], items: [] };
      indice.set(ruta, nodo);
      raiz.push(nodo);
    }
    nodo.propio = item;
  }

  return { raiz, sueltos };
}
