/**
 * ARCHIVO: useMisPendientes.js
 * PROPÓSITO: Una sola llamada a GET /agenda, compartida por el badge de
 *            "Mis actividades" del sidebar y por la tarjeta "Mis
 *            actividades" de Inicio.jsx — mismo criterio que
 *            useCentroNotificaciones (ver Layout.jsx): si cada quien la
 *            pidiera por su cuenta, dos componentes montados a la vez
 *            (Sidebar + Inicio) disparaban DOS peticiones a /agenda en
 *            cada carga del Inicio, y encima con dos cálculos de
 *            "vencidas" distintos (este hook tenía el suyo, a mano, en
 *            vez de usar calcularResumenMisActividades). Se pide UNA
 *            vez aquí (Layout.jsx), y tanto el conteo del badge como el
 *            de la tarjeta salen del mismo `resumen`.
 */
import { useState, useEffect, useCallback } from 'react';
import * as accionesApi from '../api/acciones';
import { calcularResumenMisActividades } from '../utils/resumenMisActividades';

export function useMisPendientes(intervaloMs = 60000) {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const res = await accionesApi.obtenerAgenda();
      setResumen(calcularResumenMisActividades(res.datos || []));
    } catch {
      setResumen(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    return () => clearInterval(intervalo);
  }, [cargar, intervaloMs]);

  return { vencidas: resumen?.vencidas ?? 0, resumen, cargando, recargar: cargar };
}
