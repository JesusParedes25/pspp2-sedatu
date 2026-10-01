/**
 * ARCHIVO: navegacionProyecto.js
 * PROPÓSITO: Helper compartido para construir/navegar las URLs de un
 *            proyecto bajo el esquema de rutas reales
 *            (/proyectos/:id/seguimiento, /resumen, etc.) — un solo
 *            lugar para no reescribir esta lógica en cada archivo que
 *            necesita enlazar a un nodo específico dentro de Seguimiento.
 */

// Construye la URL de Seguimiento para un proyecto, opcionalmente con un
// nodo (y un riesgo) a enfocar — mismo contrato que ya leía
// EtapasAvancesMD vía ?nodo=/?riesgo= bajo el esquema de rutas viejo
// (?tab=seguimiento&nodo=&riesgo=), ahora bajo la ruta real.
export function urlSeguimientoProyecto(proyectoId, { nodoId, riesgoId } = {}) {
  const params = new URLSearchParams();
  if (nodoId) params.set('nodo', nodoId);
  if (riesgoId) params.set('riesgo', riesgoId);
  const qs = params.toString();
  return `/proyectos/${proyectoId}/seguimiento${qs ? `?${qs}` : ''}`;
}

// Navega a un nodo específico dentro de Seguimiento de un proyecto —
// usado desde Resumen/Panorama, Bitácora, notificaciones, etc. `navigate`
// es el resultado de useNavigate() del llamador.
export function irANodoProyecto(navigate, proyectoId, nodoId, riesgoId) {
  navigate(urlSeguimientoProyecto(proyectoId, { nodoId, riesgoId }));
}
