/**
 * ARCHIVO: useProyectos.js
 * PROPÓSITO: Hook personalizado para gestionar el estado de proyectos.
 *
 * MINI-CLASE: Custom hooks en React
 * ─────────────────────────────────────────────────────────────────
 * Un custom hook encapsula lógica reutilizable con estado. En lugar
 * de repetir useState + useEffect + manejo de errores en cada
 * componente que necesita proyectos, este hook lo centraliza. Los
 * componentes solo llaman useProyectos() y obtienen los datos,
 * funciones de carga y estados de loading/error listos para usar.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import * as proyectosApi from '../api/proyectos';

export function useProyectos(filtrosIniciales = {}) {
  const [proyectos, setProyectos] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(filtrosIniciales);

  const cargar = useCallback(async (filtrosOverride) => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await proyectosApi.listarProyectos(filtrosOverride || filtros);
      setProyectos(respuesta.datos.proyectos);
      setTotal(respuesta.datos.total);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar proyectos');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Actualizar filtros y recargar automáticamente
  const actualizarFiltros = useCallback((nuevosFiltros) => {
    setFiltros(prev => ({ ...prev, ...nuevosFiltros }));
  }, []);

  return { proyectos, total, cargando, error, cargar, filtros, actualizarFiltros };
}

export function useProyecto(proyectoId) {
  const [proyecto, setProyecto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    setError(null);
    try {
      const respuesta = await proyectosApi.obtenerProyecto(proyectoId);
      setProyecto(respuesta.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar proyecto');
    } finally {
      setCargando(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { proyecto, cargando, error, recargar: cargar };
}
