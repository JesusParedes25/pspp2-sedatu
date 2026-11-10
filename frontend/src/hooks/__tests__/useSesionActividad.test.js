// @vitest-environment jsdom
/**
 * ARCHIVO: useSesionActividad.test.js
 * PROPÓSITO: paso 5 (sesión por inactividad) — casos pedidos:
 *              - la conexión de notificaciones en tiempo real (SSE) y el
 *                polling de fondo NO cuentan como actividad: aunque
 *                lleguen avisos o corra un temporizador, renovarSesion()
 *                no se llama si no hubo una interacción real del DOM.
 *              - una interacción real (click/tecla/scroll/touch) SÍ
 *                renueva, con moderación: una vez por minuto como máximo
 *                (throttle, no debounce).
 *              - el aviso de "por expirar" aparece a los 5 minutos de
 *                expiraEn y "Seguir conectado" renueva sin esperar al
 *                throttle.
 *
 * mousemove se dispara aparte a propósito: NO debe contar (ver la nota
 * técnica de useSesionActividad.js).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSesionActividad } from '../useSesionActividad';

const renovarSesionMock = vi.fn();
let estadoAuth;

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => estadoAuth,
}));

function dispatch(tipo) {
  act(() => {
    window.dispatchEvent(new Event(tipo));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  renovarSesionMock.mockReset();
  renovarSesionMock.mockResolvedValue();
  estadoAuth = {
    estaAutenticado: true,
    expiraEn: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    renovarSesion: renovarSesionMock,
  };
});

afterEach(() => {
  // Sin esto, el listener de window que cada renderHook() deja montado
  // sobrevive al siguiente test (vite.config.js no trae `globals: true`
  // ni setupFiles, así que el auto-cleanup de testing-library no se
  // engancha solo) y las interacciones simuladas disparan TODOS los
  // montajes acumulados a la vez, no solo el del test actual.
  cleanup();
  vi.useRealTimers();
});

describe('qué NO cuenta como actividad', () => {
  it('tráfico de red / mensajes SSE simulados (sin evento de DOM) nunca renuevan la sesión', () => {
    renderHook(() => useSesionActividad());

    // Simula lo que haría una conexión SSE entregando avisos, o el
    // polling de fondo corriendo varias veces: nada de esto pasa por un
    // listener de window, así que no debe disparar nada.
    for (let i = 0; i < 5; i += 1) {
      act(() => { vi.advanceTimersByTime(5000); });
    }
    expect(renovarSesionMock).not.toHaveBeenCalled();
  });

  it('mousemove tampoco cuenta (solo click/tecla/touch/scroll)', () => {
    renderHook(() => useSesionActividad());
    dispatch('mousemove');
    expect(renovarSesionMock).not.toHaveBeenCalled();
  });

  it('sin sesión activa, no se suscribe a nada', () => {
    estadoAuth.estaAutenticado = false;
    renderHook(() => useSesionActividad());
    dispatch('keydown');
    expect(renovarSesionMock).not.toHaveBeenCalled();
  });
});

describe('qué SÍ cuenta como actividad', () => {
  it.each(['mousedown', 'keydown', 'touchstart', 'scroll'])('%s renueva la sesión', (tipo) => {
    renderHook(() => useSesionActividad());
    dispatch(tipo);
    expect(renovarSesionMock).toHaveBeenCalledTimes(1);
  });

  it('con moderación: dos interacciones dentro del mismo minuto solo renuevan una vez', () => {
    renderHook(() => useSesionActividad());
    dispatch('keydown');
    dispatch('mousedown');
    dispatch('scroll');
    expect(renovarSesionMock).toHaveBeenCalledTimes(1);
  });

  it('pasado el minuto, la siguiente interacción vuelve a renovar', () => {
    renderHook(() => useSesionActividad());
    dispatch('keydown');
    expect(renovarSesionMock).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(61_000); });
    dispatch('keydown');
    expect(renovarSesionMock).toHaveBeenCalledTimes(2);
  });
});

describe('aviso de sesión por expirar', () => {
  it('no aparece mientras falten más de 5 minutos', () => {
    estadoAuth.expiraEn = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useSesionActividad());
    expect(result.current.mostrarAviso).toBe(false);
  });

  it('aparece cuando faltan 5 minutos o menos', () => {
    estadoAuth.expiraEn = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useSesionActividad());
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.mostrarAviso).toBe(true);
  });

  it('"continuar" renueva sin esperar el throttle y oculta el aviso', async () => {
    estadoAuth.expiraEn = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useSesionActividad());
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.mostrarAviso).toBe(true);

    await act(async () => { await result.current.continuarSesion(); });
    expect(renovarSesionMock).toHaveBeenCalledTimes(1);
    expect(result.current.mostrarAviso).toBe(false);
  });
});
