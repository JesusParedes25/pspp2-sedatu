/**
 * ARCHIVO: useJerarquiaProyecto.js
 * PROPÓSITO: Consolida el despacho "según tipo de nodo (etapa/acción/tarea)
 *            → qué función de la API llamar" que antes estaba repetido de
 *            forma casi idéntica en CrearInline, AvanceInlineArbol y
 *            guardarCampo de PanelDetalle. Lo consume tanto "Detalle" como
 *            la futura vista "Diagrama".
 *
 * MINI-CLASE: envoltorio delgado, no lógica nueva
 * ─────────────────────────────────────────────────────────────────
 * Cada método aquí llama exactamente la misma función de
 * etapasApi/accionesApi/tareasApi que ya se llamaba en cada sitio antes
 * de esta extracción, con el mismo payload. No agrega validaciones, no
 * cambia mensajes de error ni de éxito — esos siguen siendo responsabilidad
 * de quien llama (cada pantalla decide cómo mostrar el resultado), para no
 * alterar ningún comportamiento ya en uso en producción.
 * ─────────────────────────────────────────────────────────────────
 */
import * as etapasApi from '../api/etapas';
import * as accionesApi from '../api/acciones';
import * as tareasApi from '../api/tareas';

export function useJerarquiaProyecto(proyectoId) {
  // Crear: etapa cuelga del proyecto; acción/tarea cuelgan de un padre
  // (etapaId o accionId respectivamente). Mismo despacho que ya hacía
  // CrearInline.
  async function crear(tipo, padreId, datos) {
    if (tipo === 'etapa') return etapasApi.crearEtapa(proyectoId, datos);
    if (tipo === 'accion') return accionesApi.crearAccionEnEtapa(padreId, datos);
    return tareasApi.crearTarea(padreId, datos);
  }

  // Actualizar un solo campo (PATCH) — mismo despacho que ya hacía
  // guardarCampo en PanelDetalle.
  async function actualizar(tipo, id, campo, valor) {
    if (tipo === 'etapa') return etapasApi.patchEtapa(id, { [campo]: valor });
    if (tipo === 'tarea') return tareasApi.patchTarea(id, { [campo]: valor });
    return accionesApi.patchAccion(id, { [campo]: valor });
  }

  // Registrar avance — mismo despacho que ya hacía AvanceInlineArbol
  // (solo aplica a acción/tarea; una etapa nunca tiene avance propio).
  async function registrarAvance(tipo, id, valor) {
    if (tipo === 'accion') return accionesApi.patchAccion(id, { avance_actual: valor });
    return tareasApi.patchTarea(id, { avance_actual: valor });
  }

  // Eliminar — no se usa todavía dentro de "Detalle" (hoy ese flujo vive
  // aparte, en ModalEditarProyecto), se expone para que "Diagrama" lo use.
  async function eliminar(tipo, id) {
    if (tipo === 'etapa') return etapasApi.eliminarEtapa(id);
    if (tipo === 'tarea') return tareasApi.eliminarTarea(id);
    return accionesApi.eliminarAccion(id);
  }

  return { crear, actualizar, registrarAvance, eliminar };
}
