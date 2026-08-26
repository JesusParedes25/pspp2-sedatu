/**
 * ARCHIVO: useNotificaciones.js
 * PROPÓSITO: Hook para la lista de notificaciones, en tiempo real.
 *
 * MINI-CLASE: SSE con polling de respaldo
 * ─────────────────────────────────────────────────────────────────
 * Además de la carga inicial y el polling de respaldo (intervalo
 * largo, por si la conexión de tiempo real no se pudo abrir), este
 * hook se suscribe a /notificaciones/stream (ver api/notificaciones.js
 * → suscribirEnVivo): en cuanto el backend crea una notificación nueva
 * para este usuario, avisa por esa conexión y aquí se recarga la lista
 * al instante — sin esperar hasta 30-60s a que toque el próximo ciclo
 * de polling.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as notificacionesApi from '../api/notificaciones';

export function useNotificaciones(intervaloMs = 60000) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(true);
  const cargarRef = useRef(null);

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
  cargarRef.current = cargar;

  // Carga inicial + polling de respaldo + tiempo real por SSE
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    const desuscribir = notificacionesApi.suscribirEnVivo(() => cargarRef.current());
    return () => { clearInterval(intervalo); desuscribir(); };
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
