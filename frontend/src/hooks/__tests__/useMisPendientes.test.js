// @vitest-environment jsdom
/**
 * ARCHIVO: useMisPendientes.test.js
 * PROPÓSITO: GET /agenda se pide UNA sola vez (Layout.jsx) y aquí vive el
 *            cálculo — "PSPP v2.0 · Inicio, color y la guía de uso",
 *            ronda de seguimiento: la tarjeta "Mis actividades" de Inicio
 *            se quedaba en blanco porque el código trataba la respuesta
 *            de accionesApi.obtenerAgenda() como si YA fuera el arreglo
 *            de ítems, cuando en realidad resuelve { datos: [...] } (el
 *            mismo shape que ya desenvuelve MisActividades.jsx con
 *            `res.datos || []`). calcularResumenMisActividades(response)
 *            truena contra un objeto que no es arreglo, el .catch se
 *            come el error, y la tarjeta queda sin dato — sin que
 *            ninguna prueba lo detectara, porque el mock de la prueba
 *            anterior resolvía directamente un arreglo (una forma que
 *            accionesApi.obtenerAgenda() nunca produce en la realidad).
 *            Esta prueba mockea obtenerAgenda con el shape REAL
 *            ({ datos: [...] }) para que una regresión de este tipo
 *            vuelva a fallar aquí.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMisPendientes } from '../useMisPendientes';

const obtenerAgendaMock = vi.fn();
vi.mock('../../api/acciones', () => ({
  obtenerAgenda: (...args) => obtenerAgendaMock(...args),
}));

function fechaOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useMisPendientes — una sola fuente para el badge del sidebar y la tarjeta de Inicio', () => {
  it('desenvuelve res.datos (el shape real de obtenerAgenda) y calcula el resumen, no se queda en null', async () => {
    // Mismo shape que devuelve el backend/axios de verdad: { datos: [...] },
    // NUNCA un arreglo plano — si el código vuelve a tratar la respuesta
    // como si ya fuera el arreglo, calcularResumenMisActividades truena y
    // esta prueba lo atrapa.
    obtenerAgendaMock.mockResolvedValue({
      datos: [
        { id: 'a1', estado: 'Pendiente', fecha_fin: fechaOffset(5) },
        { id: 'a2', estado: 'En_proceso', fecha_fin: fechaOffset(-2) },
        { id: 'a3', estado: 'Completada', fecha_fin: fechaOffset(-10) },
      ],
    });

    const { result } = renderHook(() => useMisPendientes());

    await waitFor(() => expect(result.current.cargando).toBe(false));

    // El resumen NO es null (la tarjeta de Inicio renderiza algo, no se
    // queda en blanco) y trae los números calculados de verdad.
    expect(result.current.resumen).not.toBeNull();
    expect(result.current.resumen.total).toBe(3);
    expect(result.current.resumen.vencidas).toBe(1);
    expect(result.current.vencidas).toBe(1);
  });

  it('una respuesta sin "datos" (shape inesperado) no deja vencidas en un estado roto: cae a 0, no a NaN/undefined', async () => {
    obtenerAgendaMock.mockResolvedValue({});
    const { result } = renderHook(() => useMisPendientes());
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.resumen).toEqual({ total: 0, vencidas: 0, proximas: 0 });
    expect(result.current.vencidas).toBe(0);
  });

  it('pide /agenda UNA sola vez por montaje, no dos', async () => {
    obtenerAgendaMock.mockResolvedValue({ datos: [] });
    const { result } = renderHook(() => useMisPendientes());
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(obtenerAgendaMock).toHaveBeenCalledTimes(1);
  });

  it('si la petición falla, no deja cargando=true para siempre', async () => {
    obtenerAgendaMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useMisPendientes());
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.resumen).toBeNull();
    expect(result.current.vencidas).toBe(0);
  });
});
