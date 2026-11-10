/**
 * ARCHIVO: useSesionActividad.js
 * PROPÓSITO: Renovar la sesión cuando hay actividad real de la persona, y
 *            avisar 5 minutos antes de que caduque por inactividad.
 *
 * NOTA TÉCNICA: qué cuenta como actividad (y qué NO)
 * ─────────────────────────────────────────────────────────────────
 * Solo eventos de interacción real del DOM: click/tap, tecla, scroll.
 * Deliberadamente NO 'mousemove' (dispara por el solo hecho de tener el
 * cursor sobre la ventana, sin que la persona esté haciendo nada) ni
 * tráfico de red — ni el polling de fondo (useNotificaciones,
 * useCentroNotificaciones, useMisPendientes) ni la conexión SSE de
 * notificaciones en tiempo real (api/notificaciones.js::suscribirEnVivo)
 * pasan por aquí, porque ninguno de los dos usa estos listeners para
 * decidir nada. Si contaran, la sesión jamás caducaría mientras la
 * pestaña siguiera abierta, sin importar si la persona sigue ahí.
 *
 * NOTA TÉCNICA: throttle, no debounce
 * ─────────────────────────────────────────────────────────────────
 * La primera interacción después de 60s de silencio renueva de inmediato
 * (adelanta el reloj); las que siguen dentro de ese minuto se ignoran.
 * Un debounce (esperar a que pare la actividad) sería lo contrario de lo
 * que se quiere: alguien escribiendo sin parar nunca dispararía nada.
 *
 * NOTA TÉCNICA: por qué no hay un timer que cierre la sesión solo
 * ─────────────────────────────────────────────────────────────────
 * Este hook nunca llama a logout() por su cuenta. El servidor es la
 * única fuente de verdad sobre cuándo expiró el token (ver
 * auth.middleware.js); un timer del navegador corriendo contra el reloj
 * LOCAL (que puede estar desfasado) solo podría equivocarse. Pasada la
 * expiración, la siguiente petición real — y si la persona no hace
 * ninguna, el polling de fondo, que corre solo, sin esperar a nadie — se
 * encuentra el 401 y el interceptor de api/client.js hace la redirección
 * limpia a /login con el mensaje correcto. Este hook solo se encarga de
 * TRATAR DE EVITAR que eso pase (renovando a tiempo) y de avisar antes.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const EVENTOS_ACTIVIDAD = ['mousedown', 'keydown', 'touchstart', 'scroll'];
const RENOVACION_INTERVALO_MIN_MS = 60 * 1000;
const AVISO_ANTES_DE_EXPIRAR_MS = 5 * 60 * 1000;
const REVISION_CADA_MS = 10 * 1000;

export function useSesionActividad() {
  const { estaAutenticado, expiraEn, renovarSesion } = useAuth();
  const ultimaRenovacionRef = useRef(0);
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(null);

  const intentarRenovar = useCallback(() => {
    const ahora = Date.now();
    if (ahora - ultimaRenovacionRef.current < RENOVACION_INTERVALO_MIN_MS) return;
    ultimaRenovacionRef.current = ahora;
    // Un fallo aquí (red caída, sesión ya revocada) no se maneja aparte:
    // si era un 401 de verdad, el interceptor de client.js ya redirige;
    // si fue la red, la próxima actividad lo vuelve a intentar.
    renovarSesion().catch(() => {});
  }, [renovarSesion]);

  useEffect(() => {
    if (!estaAutenticado) return undefined;
    EVENTOS_ACTIVIDAD.forEach((ev) => window.addEventListener(ev, intentarRenovar, { passive: true }));
    return () => {
      EVENTOS_ACTIVIDAD.forEach((ev) => window.removeEventListener(ev, intentarRenovar));
    };
  }, [estaAutenticado, intentarRenovar]);

  useEffect(() => {
    if (!estaAutenticado || !expiraEn) {
      setMostrarAviso(false);
      return undefined;
    }
    const calcular = () => {
      const restanteMs = new Date(expiraEn).getTime() - Date.now();
      setSegundosRestantes(Math.max(0, Math.round(restanteMs / 1000)));
      setMostrarAviso(restanteMs > 0 && restanteMs <= AVISO_ANTES_DE_EXPIRAR_MS);
    };
    calcular();
    const intervalo = setInterval(calcular, REVISION_CADA_MS);
    return () => clearInterval(intervalo);
  }, [estaAutenticado, expiraEn]);

  // "Seguir conectado" del aviso: renovación explícita, sin esperar al
  // throttle (si la persona ve el aviso es, por definición, porque ya
  // pasaron más de 5 minutos desde la última renovación).
  const continuarSesion = useCallback(async () => {
    ultimaRenovacionRef.current = Date.now();
    await renovarSesion();
    setMostrarAviso(false);
  }, [renovarSesion]);

  return { mostrarAviso, segundosRestantes, continuarSesion };
}
