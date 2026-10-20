/**
 * ARCHIVO: useVolverAProceso.js
 * PROPÓSITO: Un clic para devolver un nodo Completada a En_proceso — mismo
 *            PUT /estado que usa SelectorEstado, sin pasar por hijos ni
 *            tocar avance (cambiarEstado solo fija avance_actual cuando el
 *            destino es Completada o Pendiente, nunca En_proceso).
 *            Compartido por FilaAcciones.jsx (el atajo junto a "Agregar X"
 *            de un nodo Completada) y EncabezadoDetalle.jsx (la simetría
 *            de "Marcar como completada" junto a la barra de avance) — una
 *            sola implementación, dos puntos de entrada, para no terminar
 *            con dos copias del mismo PUT y del mismo texto de error.
 */
import { useState } from 'react';
import * as estadoApi from '../api/estado';

export function useVolverAProceso({ entidadTipo, entidadId, sustantivo, mostrarToast, onCambiado }) {
  const [volviendo, setVolviendo] = useState(false);

  async function volverAProceso() {
    setVolviendo(true);
    try {
      await estadoApi.cambiarEstado(entidadTipo, entidadId, 'En_proceso');
      mostrarToast?.(`${sustantivo.charAt(0).toUpperCase() + sustantivo.slice(1)} vuelta a En proceso`, 'exito');
      onCambiado?.();
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'Error al cambiar el estado', 'error');
    } finally {
      setVolviendo(false);
    }
  }

  return { volverAProceso, volviendo };
}
