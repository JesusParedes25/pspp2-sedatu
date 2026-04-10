/**
 * ARCHIVO: useEtapas.js
 * PROPÓSITO: Hook personalizado para gestionar etapas de un proyecto.
 *
 * MINI-CLASE: Hooks con dependencias dinámicas
 * ─────────────────────────────────────────────────────────────────
 * Este hook recibe proyectoId y opcionalmente idDg como parámetros.
 * Cuando cualquiera cambia, useEffect se re-ejecuta y recarga las
 * etapas. Esto permite que al cambiar de DG en el SelectorDG, las
 * etapas se filtren automáticamente sin lógica adicional en el
 * componente padre.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import * as etapasApi from '../api/etapas';

export function useEtapas(proyectoId, idDg) {
  const [etapas, setEtapas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    setError(null);
    try {
      const respuesta = await etapasApi.obtenerEtapasProyecto(proyectoId, idDg);
      setEtapas(respuesta.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar etapas');
    } finally {
      setCargando(false);
    }
  }, [proyectoId, idDg]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { etapas, cargando, error, recargar: cargar };
}
