/**
 * ARCHIVO: useMisPendientes.js
 * PROPÓSITO: Hook ligero para el badge de "Mis actividades" en el sidebar —
 *            reutiliza el mismo endpoint /agenda que ya usa la Agenda y la
 *            pestaña Pendientes, solo para contar vencidas.
 */
import { useState, useEffect, useCallback } from 'react';
import * as accionesApi from '../api/acciones';

export function useMisPendientes(intervaloMs = 60000) {
  const [vencidas, setVencidas] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const res = await accionesApi.obtenerAgenda();
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const items = res.datos || [];
      const count = items.filter(it => {
        if (it.estado === 'Completada' || it.estado === 'Cancelada') return false;
        if (!it.fecha_fin) return false;
        const [y, m, d] = String(it.fecha_fin).slice(0, 10).split('-').map(Number);
        if (!y) return false;
        return new Date(y, m - 1, d) < hoy;
      }).length;
      setVencidas(count);
    } catch {
      setVencidas(0);
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, intervaloMs);
    return () => clearInterval(intervalo);
  }, [cargar, intervaloMs]);

  return { vencidas, recargar: cargar };
}
