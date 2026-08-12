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

// El Resumen de cartera lee varias listas del backend (resumenCartera en
// carteras.queries.js) directamente con .length y .map. Si el backend
// desplegado es más viejo que el frontend — pasa cuando se reconstruye la
// imagen del frontend pero no la del backend, que en prod van por separado
// — esos campos llegan undefined y la página entera truena con "Cannot read
// properties of undefined (reading 'length')". Normalizar aquí hace que un
// desajuste de versiones se vea como secciones vacías (degradado) en vez de
// una pantalla en blanco.
const LISTAS_RESUMEN = ['vencidos', 'por_vencer', 'riesgos', 'indicadores', 'estatus_cualitativo'];

function normalizarResumen(datos) {
  if (!datos) return datos;
  const normalizado = { ...datos };
  for (const clave of LISTAS_RESUMEN) {
    if (!Array.isArray(normalizado[clave])) normalizado[clave] = [];
  }
  return normalizado;
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
      setProyectos(Array.isArray(resProyectos.datos) ? resProyectos.datos : []);
      setResumen(normalizarResumen(resResumen.datos));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar la cartera');
    } finally {
      setCargando(false);
    }
  }, [carteraId]);

  useEffect(() => { cargar(); }, [cargar]);

  return { cartera, proyectos, resumen, cargando, error, recargar: cargar };
}
