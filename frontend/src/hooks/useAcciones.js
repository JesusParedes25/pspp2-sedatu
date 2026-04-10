/**
 * ARCHIVO: useAcciones.js
 * PROPÓSITO: Hook personalizado para gestionar acciones de una etapa.
 *
 * MINI-CLASE: Debounce para actualización de porcentaje
 * ─────────────────────────────────────────────────────────────────
 * Cuando el usuario mueve el input de porcentaje, no queremos enviar
 * una petición PUT por cada cambio de valor. El debounce espera
 * 800ms después del último cambio antes de enviar la petición.
 * Esto reduce la carga en el servidor y evita recálculos innecesarios.
 * El hook expone actualizarPorcentaje() que ya incluye el debounce.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as accionesApi from '../api/acciones';

export function useAcciones(etapaId) {
  const [acciones, setAcciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!etapaId) return;
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const respuesta = await accionesApi.obtenerAccionesEtapa(etapaId);
      setAcciones(respuesta.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar acciones');
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [etapaId]);

  // Recarga silenciosa: actualiza datos sin mostrar spinner (no desmonta hijos)
  const recargarSilencioso = useCallback(() => cargar(true), [cargar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Actualizar porcentaje con debounce de 800ms
  const actualizarPorcentaje = useCallback((accionId, porcentaje) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Actualizar localmente de inmediato para feedback visual
    setAcciones(prev => prev.map(a =>
      a.id === accionId ? { ...a, porcentaje_avance: porcentaje } : a
    ));

    // Enviar al servidor después de 800ms sin cambios
    debounceRef.current = setTimeout(async () => {
      try {
        await accionesApi.actualizarAccion(accionId, { porcentaje_avance: porcentaje });
      } catch (err) {
        console.error('Error al actualizar porcentaje:', err);
        // Recargar para revertir el valor local
        cargar();
      }
    }, 800);
  }, [cargar]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { acciones, cargando, error, recargar: cargar, recargarSilencioso, actualizarPorcentaje };
}
