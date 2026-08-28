/**
 * Helpers para renderizar filas de "estatus cualitativo" (migración 047)
 * que ya vienen mezcladas de etapa/acción/tarea desde el backend — cada
 * item trae un `tipo_nodo` ('etapa'|'accion'|'tarea') y los campos de
 * nombre de todos los niveles (los que no aplican vienen null).
 *
 * Compartido por ListaEstatusCualitativo.jsx (Tablero, Panorama, Resumen
 * de cartera) y el popover de proyecto en Inicio.jsx, para no duplicar la
 * lógica de armado de breadcrumb entre los dos lugares.
 */

// Nombre propio del nodo, sin importar el nivel.
export function nombreNodoEstatusCualitativo(item) {
  if (item.tipo_nodo === 'accion') return item.accion_nombre;
  if (item.tipo_nodo === 'tarea') return item.tarea_nombre;
  return item.etapa_nombre;
}

// Ruta corta dentro del proyecto (sin el nombre del proyecto, que lo
// antepone quien llame según el contexto): "Etapa", "Etapa › Acción",
// "Etapa › AcciónPadre › Subacción" o "Etapa › Acción › Tarea".
export function breadcrumbInternoEstatusCualitativo(item) {
  if (item.tipo_nodo === 'etapa') return item.etapa_nombre;

  if (item.tipo_nodo === 'accion') {
    const accion = item.accion_padre_nombre
      ? `${item.accion_padre_nombre} › ${item.accion_nombre}`
      : item.accion_nombre;
    return item.etapa_nombre ? `${item.etapa_nombre} › ${accion}` : accion;
  }

  // tarea
  const ruta = `${item.accion_nombre} › ${item.tarea_nombre}`;
  return item.etapa_nombre ? `${item.etapa_nombre} › ${ruta}` : ruta;
}
