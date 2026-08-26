/**
 * ARCHIVO: notificaciones.js
 * PROPÓSITO: Funciones de API para notificaciones del usuario.
 *
 * MINI-CLASE: tiempo real (SSE) con polling como respaldo
 * ─────────────────────────────────────────────────────────────────
 * suscribirEnVivo() abre la conexión SSE de /notificaciones/stream y
 * llama a `onAviso` cada vez que el backend indica que algo cambió —
 * así los hooks de arriba (useNotificaciones, useCentroNotificaciones)
 * refrescan al instante en vez de esperar al siguiente ciclo de
 * polling. El polling se conserva como respaldo (intervalo largo) por
 * si la conexión SSE nunca llega a abrirse o se cae de forma
 * persistente — un proxy intermedio, una red corporativa que corta
 * conexiones de larga duración, etc. No se usa EventSource nativo
 * porque no permite mandar el header Authorization; se lee el stream
 * a mano con fetch + ReadableStream para reusar el mismo Bearer token
 * que ya usa el resto de la API.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

const BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export function suscribirEnVivo(onAviso) {
  const token = localStorage.getItem('pspp_token');
  if (!token) return () => {};

  let activo = true;
  const controlador = new AbortController();

  (async function conectar(intento = 0) {
    while (activo) {
      try {
        const resp = await fetch(`${BASE_URL}/notificaciones/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controlador.signal,
        });
        if (!resp.ok || !resp.body) throw new Error(`SSE respondió ${resp.status}`);

        const lector = resp.body.getReader();
        const decodificador = new TextDecoder();
        let buffer = '';
        intento = 0; // conexión exitosa: la próxima caída reinicia el backoff desde cero

        while (activo) {
          const { done, value } = await lector.read();
          if (done) break;
          buffer += decodificador.decode(value, { stream: true });
          const bloques = buffer.split('\n\n');
          buffer = bloques.pop(); // bloque incompleto — se completa con el próximo chunk
          for (const bloque of bloques) {
            if (bloque.startsWith('data:')) onAviso();
          }
        }
      } catch (err) {
        if (!activo || err.name === 'AbortError') return;
      }
      if (!activo) return;
      // Reconexión con backoff (hasta 30s) — evita bombardear al backend
      // si la caída es persistente (deploy en curso, red intermitente).
      const espera = Math.min(30000, 1000 * 2 ** intento);
      intento += 1;
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  })();

  return () => { activo = false; controlador.abort(); };
}

export async function obtenerNotificaciones() {
  const { data } = await client.get('/notificaciones');
  return data;
}

// Cuenta combinada para la campanita: avisos sin leer + invitaciones
// pendientes + solicitudes por resolver. Un aviso se lee y se olvida,
// pero una invitación o una solicitud son pendientes de verdad — si la
// campanita solo contara avisos, alguien con una solicitud esperando la
// vería en cero y pensaría que no tiene nada por atender.
export async function obtenerResumen() {
  const { data } = await client.get('/notificaciones/resumen');
  return data.datos;
}

export async function marcarLeida(id) {
  const { data } = await client.put(`/notificaciones/${id}/leer`);
  return data;
}

export async function marcarTodasLeidas() {
  const { data } = await client.put('/notificaciones/leer-todas');
  return data;
}
