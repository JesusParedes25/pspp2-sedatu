/**
 * ARCHIVO: useCarteras.js
 * PROPÓSITO: Hooks para listar carteras y para el tablero de una cartera
 *            individual (datos + proyectos + resumen, recargables).
 */
import { useState, useEffect, useCallback } from 'react';
import * as carterasApi from '../api/carteras';

export function useCarteras(filtrosIniciales = {}) {
  const [carteras, setCarteras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(filtrosIniciales);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await carterasApi.listarCarteras(filtros);
      setCarteras(respuesta.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar carteras');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  return { carteras, cargando, error, recargar: cargar, filtros, setFiltros };
}

export function useCartera(carteraId) {
  const [cartera, setCartera] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!carteraId) return;
    setCargando(true);
    setError(null);
    try {
      const [resCartera, resProyectos, resResumen] = await Promise.all([
        carterasApi.obtenerCartera(carteraId),
        carterasApi.listarProyectosDeCartera(carteraId),
        carterasApi.obtenerResumenCartera(carteraId),
      ]);
      setCartera(resCartera.datos);
      setProyectos(resProyectos.datos);
      setResumen(resResumen.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar la cartera');
    } finally {
      setCargando(false);
    }
  }, [carteraId]);

  useEffect(() => { cargar(); }, [cargar]);

  return { cartera, proyectos, resumen, cargando, error, recargar: cargar };
}
