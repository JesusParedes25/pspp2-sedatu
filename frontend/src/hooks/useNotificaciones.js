/**
 * ARCHIVO: useNotificaciones.js
 * PROPÓSITO: Hook personalizado para polling de notificaciones.
 *
 * MINI-CLASE: Polling con setInterval en React
 * ─────────────────────────────────────────────────────────────────
 * Este hook configura un setInterval que consulta las notificaciones
 * cada 30 segundos. useEffect limpia el interval al desmontar el
 * componente para evitar memory leaks. El conteo de no leídas se
 * actualiza en cada polling para mantener el badge del header
 * sincronizado sin necesidad de WebSockets.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import * as notificacionesApi from '../api/notificaciones';

export function useNotificaciones(intervaloMs = 30000) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await notificacionesApi.obtenerNotificaciones();
      setNotificaciones(respuesta.datos.notificaciones);
      setNoLeidas(respuesta.datos.no_leidas);
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial + polling cada N milisegundos
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    return () => clearInterval(intervalo);
  }, [cargar, intervaloMs]);

  const marcarLeida = useCallback(async (id) => {
    try {
      await notificacionesApi.marcarLeida(id);
      setNotificaciones(prev => prev.map(n =>
        n.id === id ? { ...n, leida: true } : n
      ));
      setNoLeidas(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error al marcar notificación:', err);
    }
  }, []);

  const marcarTodasLeidas = useCallback(async () => {
    try {
      await notificacionesApi.marcarTodasLeidas();
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
      setNoLeidas(0);
    } catch (err) {
      console.error('Error al marcar todas:', err);
    }
  }, []);

  return { notificaciones, noLeidas, cargando, cargar, marcarLeida, marcarTodasLeidas };
}
