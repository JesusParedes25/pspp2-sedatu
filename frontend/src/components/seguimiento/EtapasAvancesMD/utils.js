/**
 * ARCHIVO: utils.js
 * PROPÓSITO: Constantes y helpers puros compartidos entre los archivos de
 *            "Detalle" (antes un solo EtapasAvancesMD.jsx, separado en
 *            varios archivos dentro de esta carpeta).
 */

export const ESTADOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];
export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Muy Alta', 'Crítica'];

// ─── Filtro recursivo del árbol ────────────────────────────────
export function filtrarArbol(nodos, nivelTipo, estado, usuario, dg) {
  return nodos.reduce((acc, nodo) => {
    const hijosKey = nivelTipo === 'etapa' ? 'acciones' : 'tareas';
    const hijos = nodo[hijosKey] || [];
    const nextTipo = nivelTipo === 'etapa' ? 'accion' : 'tarea';
    const hijosFiltrados = hijos.length > 0 ? filtrarArbol(hijos, nextTipo, estado, usuario, dg) : [];

    const matchEstado = !estado || nodo.estado === estado;
    const q = usuario.toLowerCase();
    const matchUsuario = !usuario ||
      (nodo.responsable_nombre || '').toLowerCase().includes(q) ||
      nodo.nombre.toLowerCase().includes(q);
    const matchDG = !dg ||
      String(nodo.responsable_dg_id) === String(dg) ||
      String(nodo.id_dg) === String(dg);
    const coincide = matchEstado && matchUsuario && matchDG;

    if (coincide || hijosFiltrados.length > 0) {
      acc.push({ ...nodo, [hijosKey]: hijosFiltrados });
    }
    return acc;
  }, []);
}

// ─── Utilidades de búsqueda en el árbol ────────────────────────
export function buscarNodoEnArbol(arbol, id) {
  for (const etapa of arbol) {
    if (etapa.id === id) return { tipo: 'etapa', id: etapa.id, data: etapa };
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === id) return { tipo: 'accion', id: acc.id, data: acc };
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === id) return { tipo: 'tarea', id: tarea.id, data: tarea };
      }
    }
  }
  return null;
}

export function encontrarPath(arbol, targetId) {
  for (const etapa of arbol) {
    if (etapa.id === targetId) return [etapa.id];
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === targetId) return [etapa.id, acc.id];
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === targetId) return [etapa.id, acc.id, tarea.id];
      }
    }
  }
  return null;
}

// Nombres de los nodos ancestros (incluido el propio nodo) para el
// breadcrumb de contexto del panel derecho — evita tener que adivinar
// si una fecha/estatus pertenece a la etapa o a la acción que se está
// viendo dentro de ella.
export function resolverRutaNombres(arbol, targetId) {
  for (const etapa of arbol) {
    if (etapa.id === targetId) return [etapa.nombre];
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === targetId) return [etapa.nombre, acc.nombre];
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === targetId) return [etapa.nombre, acc.nombre, tarea.nombre];
      }
    }
  }
  return null;
}
