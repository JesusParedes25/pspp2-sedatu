/**
 * ARCHIVO: utils.js
 * PROPÓSITO: Constantes y helpers puros compartidos entre los archivos de
 *            "Detalle" (antes un solo EtapasAvancesMD.jsx, separado en
 *            varios archivos dentro de esta carpeta).
 */

export const ESTADOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];
export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Muy Alta', 'Crítica'];

// Visita cada nodo del árbol (etapa, acción, subacción, tarea) — única
// fuente para "recorrer todo sin dejar nada fuera". Antes cada callsite
// (DGs del árbol, auto-expandir tras filtrar) reimplementaba su propia
// recursión bajando solo a `acciones`→`tareas`, sin pasar nunca por
// `subacciones` — cualquier nodo colgado de una subacción quedaba fuera
// de los tres (invisible en el selector de DG, nunca auto-expandido).
export function recorrerArbol(etapas, fn) {
  etapas.forEach(etapa => {
    fn(etapa);
    (etapa.acciones || []).forEach(accion => {
      fn(accion);
      (accion.subacciones || []).forEach(sub => {
        fn(sub);
        (sub.tareas || []).forEach(fn);
      });
      (accion.tareas || []).forEach(fn);
    });
  });
}

// ─── Filtro recursivo del árbol ────────────────────────────────
// usuarioId: UUID de un responsable o colaborador (ya no texto libre —
// el selector del panel de filtros ahora es una lista desplegable de
// personas reales, ver EtapasAvancesMD/index.jsx). Compara contra
// `id_responsable` y contra cada entrada de `colaboradores` (ver
// backend/src/utils/avance-semaforo.js::obtenerSubarbol, que ahora trae
// ambos por nodo) — antes solo comparaba texto contra el nombre del
// responsable principal, así que un colaborador (no responsable) de un
// nodo nunca aparecía al filtrar por su nombre.
// riesgo: '' (todos) | 'con' | 'sin' — compara contra `riesgos_abiertos`
// (conteo ya resuelto por el backend, no algo que el frontend calcule).
function nodoTieneUsuario(nodo, usuarioId) {
  return String(nodo.id_responsable) === String(usuarioId) ||
    (nodo.colaboradores || []).some(c => String(c.id) === String(usuarioId));
}

// `usuarioHeredado`: true si YA se resolvió que un ANCESTRO de este nodo
// (etapa/acción) es responsable o colaborador de la persona filtrada —
// se propaga hacia abajo (ver filtrarArbol). Sin esto, ser colaborador
// de una Etapa completa no servía de nada para filtrar sus Acciones/
// Tareas: alguien a cargo de supervisar toda una etapa quedaba sin
// forma de ver "lo suyo" en conjunto con otro filtro (ej. "con riesgo
// abierto"), porque el riesgo vivía en una Acción hija donde esa
// persona nunca estaba etiquetada nodo por nodo.
function coincideNodo(nodo, estado, usuarioId, dg, riesgo, usuarioHeredado) {
  const matchEstado = !estado || nodo.estado === estado;
  const matchUsuario = !usuarioId || usuarioHeredado || nodoTieneUsuario(nodo, usuarioId);
  const matchDG = !dg ||
    String(nodo.responsable_dg_id) === String(dg) ||
    String(nodo.id_dg) === String(dg);
  const matchRiesgo = !riesgo ||
    (riesgo === 'con' ? (nodo.riesgos_abiertos || 0) > 0 : (nodo.riesgos_abiertos || 0) === 0);
  return matchEstado && matchUsuario && matchDG && matchRiesgo;
}

// Recorre etapa → acción/subacción → tarea explícitamente (en vez de un
// solo `hijosKey` genérico) porque una acción tiene DOS arreglos de hijos
// distintos (`subacciones` y `tareas`) que hay que filtrar cada uno por
// su cuenta — la versión anterior solo bajaba a `acciones`→`tareas` y
// nunca entraba a `subacciones`, así que cualquier nodo colgado de una
// subacción (la subacción misma, o sus tareas) desaparecía en silencio
// en cuanto algún filtro estaba activo, sin importar si coincidía o no.
//
// El filtro de usuario SÍ hereda hacia abajo (una Acción cuenta como "de
// esa persona" si ella es responsable/colaboradora de la Etapa que la
// contiene, aunque no esté etiquetada en la Acción misma) — a
// diferencia de DG y Riesgo, que son estrictamente por nodo: una Etapa
// puede tener Acciones de otra DG perfectamente válidas colgando de
// ella, y el riesgo de un hijo ya sube solo por la regla de abajo
// ("mostrar si algún hijo coincide"), sin necesitar heredarse hacia
// abajo también.
export function filtrarArbol(etapas, estado, usuarioId, dg, riesgo) {
  return etapas.reduce((acc, etapa) => {
    const etapaTieneUsuario = !!usuarioId && nodoTieneUsuario(etapa, usuarioId);
    const acciones = (etapa.acciones || []).reduce((accAcc, accion) => {
      const accionHereda = etapaTieneUsuario || (!!usuarioId && nodoTieneUsuario(accion, usuarioId));
      const subacciones = (accion.subacciones || []).reduce((subAcc, sub) => {
        const subHereda = accionHereda || (!!usuarioId && nodoTieneUsuario(sub, usuarioId));
        const tareasSub = (sub.tareas || []).filter(t => coincideNodo(t, estado, usuarioId, dg, riesgo, subHereda));
        if (coincideNodo(sub, estado, usuarioId, dg, riesgo, accionHereda) || tareasSub.length > 0) {
          subAcc.push({ ...sub, tareas: tareasSub });
        }
        return subAcc;
      }, []);
      const tareas = (accion.tareas || []).filter(t => coincideNodo(t, estado, usuarioId, dg, riesgo, accionHereda));
      if (coincideNodo(accion, estado, usuarioId, dg, riesgo, etapaTieneUsuario) || subacciones.length > 0 || tareas.length > 0) {
        accAcc.push({ ...accion, subacciones, tareas });
      }
      return accAcc;
    }, []);
    if (coincideNodo(etapa, estado, usuarioId, dg, riesgo, false) || acciones.length > 0) {
      acc.push({ ...etapa, acciones });
    }
    return acc;
  }, []);
}

// ─── Utilidades de búsqueda en el árbol ────────────────────────
// Nota: una acción puede tener subacciones (acciones anidadas, un solo
// nivel de profundidad — ver backend/src/utils/avance-semaforo.js) además
// de sus propias tareas. Las cuatro funciones de este bloque tienen que
// recorrer también `acc.subacciones` y las tareas de cada subacción, si no
// cualquier nodo dentro de una subacción (la subacción misma, o una tarea
// colgada de ella) nunca se encuentra — antes rompía en silencio el
// deep-link (?nodo=) y el breadcrumb clicable del panel derecho para esos
// nodos.
export function buscarNodoEnArbol(arbol, id) {
  for (const etapa of arbol) {
    if (etapa.id === id) return { tipo: 'etapa', id: etapa.id, data: etapa };
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === id) return { tipo: 'accion', id: acc.id, data: acc };
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === id) return { tipo: 'tarea', id: tarea.id, data: tarea };
      }
      for (const sub of (acc.subacciones || [])) {
        if (sub.id === id) return { tipo: 'accion', id: sub.id, data: sub };
        for (const tarea of (sub.tareas || [])) {
          if (tarea.id === id) return { tipo: 'tarea', id: tarea.id, data: tarea };
        }
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
      for (const sub of (acc.subacciones || [])) {
        if (sub.id === targetId) return [etapa.id, acc.id, sub.id];
        for (const tarea of (sub.tareas || [])) {
          if (tarea.id === targetId) return [etapa.id, acc.id, sub.id, tarea.id];
        }
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
      for (const sub of (acc.subacciones || [])) {
        if (sub.id === targetId) return [etapa.nombre, acc.nombre, sub.nombre];
        for (const tarea of (sub.tareas || [])) {
          if (tarea.id === targetId) return [etapa.nombre, acc.nombre, sub.nombre, tarea.nombre];
        }
      }
    }
  }
  return null;
}

// Hijos directos de un nodo como {tipo, nodo}[] — una sola fuente para esta
// regla (antes repetida por separado en PanelDetalle, PropiedadesElemento y
// la lista central): etapa → acciones; acción → sus subacciones (acciones
// anidadas) + tareas; tarea nunca tiene hijos.
export function hijosDe(tipo, data) {
  if (tipo === 'etapa') return (data.acciones || []).map(a => ({ tipo: 'accion', nodo: a }));
  if (tipo === 'accion') return [
    ...(data.subacciones || []).map(s => ({ tipo: 'accion', nodo: s })),
    ...(data.tareas || []).map(t => ({ tipo: 'tarea', nodo: t })),
  ];
  return [];
}

// Igual que resolverRutaNombres, pero con {tipo, id, nombre} por escalón —
// para el lineage clicable del panel derecho (subir de nivel sin pasar por
// el árbol). El propio nodo también viene incluido (último elemento).
export function resolverRutaConIds(arbol, targetId) {
  for (const etapa of arbol) {
    if (etapa.id === targetId) return [{ tipo: 'etapa', id: etapa.id, nombre: etapa.nombre }];
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === targetId) return [
        { tipo: 'etapa', id: etapa.id, nombre: etapa.nombre },
        { tipo: 'accion', id: acc.id, nombre: acc.nombre },
      ];
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === targetId) return [
          { tipo: 'etapa', id: etapa.id, nombre: etapa.nombre },
          { tipo: 'accion', id: acc.id, nombre: acc.nombre },
          { tipo: 'tarea', id: tarea.id, nombre: tarea.nombre },
        ];
      }
      for (const sub of (acc.subacciones || [])) {
        if (sub.id === targetId) return [
          { tipo: 'etapa', id: etapa.id, nombre: etapa.nombre },
          { tipo: 'accion', id: acc.id, nombre: acc.nombre },
          { tipo: 'accion', id: sub.id, nombre: sub.nombre },
        ];
        for (const tarea of (sub.tareas || [])) {
          if (tarea.id === targetId) return [
            { tipo: 'etapa', id: etapa.id, nombre: etapa.nombre },
            { tipo: 'accion', id: acc.id, nombre: acc.nombre },
            { tipo: 'accion', id: sub.id, nombre: sub.nombre },
            { tipo: 'tarea', id: tarea.id, nombre: tarea.nombre },
          ];
        }
      }
    }
  }
  return null;
}
