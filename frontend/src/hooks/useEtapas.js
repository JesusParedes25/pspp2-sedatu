/**
 * ARCHIVO: useEtapas.js
 * PROPÓSITO: Hook personalizado para gestionar etapas de un proyecto.
 *
 * NOTA TÉCNICA: Hooks con dependencias dinámicas
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
  // Código del error (p.ej. 'NO_AUTORIZADO') además del mensaje — paso 12
  // DGTIC: DetalleProyectoLayout.jsx lo usa para distinguir "no tienes
  // visibilidad de este proyecto" de cualquier otra falla y mostrar la
  // pantalla de sin acceso en vez de un error genérico.
  const [errorCodigo, setErrorCodigo] = useState(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!proyectoId) return;
    if (!silencioso) setCargando(true);
    setError(null);
    setErrorCodigo(null);
    try {
      const respuesta = await etapasApi.obtenerEtapasProyecto(proyectoId, idDg);
      setEtapas(respuesta.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar etapas');
      setErrorCodigo(err.response?.data?.codigo || null);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [proyectoId, idDg]);

  // Recarga silenciosa: actualiza datos sin mostrar spinner (no desmonta hijos)
  const recargarSilencioso = useCallback(() => cargar(true), [cargar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { etapas, cargando, error, errorCodigo, recargar: cargar, recargarSilencioso };
}
