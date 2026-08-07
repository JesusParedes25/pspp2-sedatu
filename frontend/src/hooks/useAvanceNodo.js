/**
 * ARCHIVO: useAvanceNodo.js
 * PROPÓSITO: Estado y guardado del avance capturado a mano en un nodo hoja
 *            (acción o tarea) — usado por BloqueEditable (rail/drawer) y
 *            antes vivía duplicado dentro de NodoCard. Una etapa nunca
 *            llama esto (su avance siempre se calcula).
 */
import { useState } from 'react';
import * as accionesApi from '../api/acciones';
import * as tareasApi from '../api/tareas';

export function useAvanceNodo(tipo, nodo, onCambiado) {
  const [avanceTemp, setAvanceTemp] = useState(Math.round(nodo.avance_actual ?? 0));
  const [guardando, setGuardando] = useState(false);

  async function guardar(valor) {
    setGuardando(true);
    try {
      // El backend solo acepta editar avance_actual cuando el nodo está
      // En_proceso — si todavía está Pendiente, el cambio de estado va en
      // la MISMA petición para que el avance sí se guarde (si no, el PATCH
      // llega con avance_actual solo y el backend lo ignora en silencio).
      const datos = { avance_actual: valor };
      if (nodo.estado !== 'En_proceso') datos.estado = 'En_proceso';
      if (tipo === 'accion') await accionesApi.patchAccion(nodo.id, datos);
      else await tareasApi.patchTarea(nodo.id, datos);
      await onCambiado?.();
    } finally {
      setGuardando(false);
    }
  }

  return { avanceTemp, setAvanceTemp, guardando, guardar };
}
