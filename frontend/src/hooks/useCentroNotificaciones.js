/**
 * ARCHIVO: useCentroNotificaciones.js
 * PROPÓSITO: Resumen combinado en tiempo real — avisos sin leer,
 *            invitaciones pendientes y solicitudes por resolver — para
 *            la campanita del header, el badge de la barra lateral y el
 *            modal de inicio de sesión.
 *
 * MINI-CLASE: por qué esto no es lo mismo que useNotificaciones
 * ─────────────────────────────────────────────────────────────────
 * useNotificaciones trae la LISTA completa de avisos (para pintar la
 * página de Notificaciones). Este hook solo trae CONTADORES — un objeto
 * chico — y es lo que necesita cualquier componente que solo quiera
 * saber "¿cuánto hay pendiente?", como el número rojo de la campanita.
 * Se refresca al instante por SSE (ver api/notificaciones.js) en cuanto
 * el backend avisa que algo cambió; el polling (intervalo largo) queda
 * solo como respaldo si esa conexión no se pudo abrir.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as notificacionesApi from '../api/notificaciones';

const VACIO = { no_leidas: 0, invitaciones: 0, solicitudes: 0, total: 0 };

export function useCentroNotificaciones(intervaloMs = 60000) {
  const [resumen, setResumen] = useState(VACIO);
  const cargarRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      setResumen(await notificacionesApi.obtenerResumen());
    } catch (err) {
      console.error('Error al cargar el resumen de notificaciones:', err);
    }
  }, []);
  cargarRef.current = cargar;

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    // cargarRef evita reabrir la conexión SSE cada vez que `cargar` cambia
    // de identidad — se suscribe una sola vez por montaje del hook.
    const desuscribir = notificacionesApi.suscribirEnVivo(() => cargarRef.current());
    return () => { clearInterval(intervalo); desuscribir(); };
  }, [cargar, intervaloMs]);

  return { ...resumen, recargar: cargar };
}
