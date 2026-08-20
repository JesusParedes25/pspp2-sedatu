/**
 * ARCHIVO: useCentroNotificaciones.js
 * PROPÓSITO: Polling del resumen combinado — avisos sin leer, invitaciones
 *            pendientes y solicitudes por resolver — para la campanita
 *            del header y el modal de inicio de sesión.
 *
 * MINI-CLASE: por qué esto no es lo mismo que useNotificaciones
 * ─────────────────────────────────────────────────────────────────
 * useNotificaciones trae la LISTA completa de avisos (para pintar la
 * página de Notificaciones). Este hook solo trae CONTADORES — un objeto
 * chico que se puede pedir cada 30s sin cargar nada pesado — y es lo que
 * necesita cualquier componente que solo quiera saber "¿cuánto hay
 * pendiente?", como el número rojo de la campanita.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import * as notificacionesApi from '../api/notificaciones';

const VACIO = { no_leidas: 0, invitaciones: 0, solicitudes: 0, total: 0 };

export function useCentroNotificaciones(intervaloMs = 30000) {
  const [resumen, setResumen] = useState(VACIO);

  const cargar = useCallback(async () => {
    try {
      setResumen(await notificacionesApi.obtenerResumen());
    } catch (err) {
      console.error('Error al cargar el resumen de notificaciones:', err);
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    return () => clearInterval(intervalo);
  }, [cargar, intervaloMs]);

  return { ...resumen, recargar: cargar };
}
