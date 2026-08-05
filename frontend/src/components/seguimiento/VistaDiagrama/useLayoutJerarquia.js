/**
 * ARCHIVO: useLayoutJerarquia.js
 * PROPÓSITO: Calcula posiciones para el organigrama horizontal (etapa →
 *            acción → tarea) usando d3-hierarchy, respetando qué ramas
 *            están colapsadas.
 *
 * MINI-CLASE: por qué un "root" virtual
 * ─────────────────────────────────────────────────────────────────
 * d3.hierarchy() espera UN solo nodo raíz, pero el proyecto tiene varias
 * etapas raíz (un bosque, no un árbol). Se envuelven todas bajo un nodo
 * raíz invisible («__root__», nunca se dibuja) — así d3.tree() calcula de
 * una sola vez las posiciones de todo el bosque, apilando las etapas
 * verticalmente sin traslaparse, sin tener que hacerlo a mano por etapa.
 *
 * En d3-hierarchy, `x` es el eje transversal (posición entre hermanos) y
 * `y` es la profundidad — por eso al mapear a React Flow se invierte:
 * position: { x: nodo.y, y: nodo.x } (así el árbol crece de izquierda a
 * derecha en vez de de arriba hacia abajo).
 * ─────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';

export const COL_WIDTH = 320; // separación horizontal entre niveles (profundidad)
export const ROW_HEIGHT = 120; // separación vertical entre hermanos (deja aire a las tarjetas de 2 líneas de nombre)

// Cuenta todos los descendientes de un nodo — se usa tanto para el contador
// de "ocultos" cuando una rama está colapsada como para el mensaje de
// confirmación al eliminar (cuántos elementos se van con él). Independiente
// de si están colapsados más adentro, siempre cuenta el total real.
export function contarDescendientes(nodoOriginal, tipo) {
  if (tipo === 'etapa') {
    return (nodoOriginal.acciones || []).reduce(
      (suma, a) => suma + 1 + contarDescendientes(a, 'accion'), 0
    );
  }
  if (tipo === 'accion') {
    return (nodoOriginal.tareas || []).length;
  }
  return 0;
}

export function useLayoutJerarquia(raices, colapsados) {
  return useMemo(() => {
    const raicesConTipo = (raices || []).map(e => ({ ...e, __tipo: 'etapa' }));
    const raizVirtual = { id: '__root__', __tipo: 'root', children: raicesConTipo };

    function hijos(d) {
      if (d.__tipo === 'root') return d.children;
      if (colapsados.has(d.id)) return null;
      if (d.__tipo === 'etapa') {
        const acciones = d.acciones || [];
        return acciones.length > 0 ? acciones.map(a => ({ ...a, __tipo: 'accion' })) : null;
      }
      if (d.__tipo === 'accion') {
        const tareas = d.tareas || [];
        return tareas.length > 0 ? tareas.map(t => ({ ...t, __tipo: 'tarea' })) : null;
      }
      return null;
    }

    const root = hierarchy(raizVirtual, hijos);
    const layout = tree().nodeSize([ROW_HEIGHT, COL_WIDTH]);
    layout(root);

    const nodes = [];
    const edges = [];

    root.each(d => {
      if (d.data.__tipo === 'root') return;
      const tipo = d.data.__tipo;
      const estaColapsado = colapsados.has(d.data.id);
      nodes.push({
        id: d.data.id,
        type: tipo,
        position: { x: d.y, y: d.x },
        draggable: false,
        data: {
          ...d.data,
          tipo,
          numDescendientesOcultos: estaColapsado ? contarDescendientes(d.data, tipo) : 0,
        },
      });
      if (d.parent && d.parent.data.__tipo !== 'root') {
        edges.push({
          id: `e-${d.parent.data.id}-${d.data.id}`,
          source: d.parent.data.id,
          target: d.data.id,
          type: 'default', // bezier suave (curva), en vez del anterior smoothstep en escuadra
          style: { stroke: '#d1d5db' },
        });
      }
    });

    return { nodes, edges };
  }, [raices, colapsados]);
}
