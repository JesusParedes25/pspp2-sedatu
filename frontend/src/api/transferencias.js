/**
 * ARCHIVO: transferencias.js
 * PROPÓSITO: Subidas y descargas grandes con avance, detección de
 *            "dejó de avanzar" y mensajes de error comprensibles.
 *
 * transferir(config, opciones) hace la petición con el cliente de siempre
 * (misma base, misma cabecera de sesión, mismo manejo de 401), pero:
 *   - sin el límite de 30 s: tope total TIEMPO_MAXIMO_TRANSFERENCIA_MS;
 *   - aborta si no llega ningún avance en TRANSFERENCIA_SIN_AVANCE_MS.
 *     En una subida, el vigilante se apaga al llegar al 100 %: a partir de
 *     ahí el servidor está guardando el archivo y no hay avance que medir
 *     (manda el tope total, y nginx con su proxy_read_timeout);
 *   - reporta onProgreso(fraccion 0..1 | null) para la barra de avance.
 *
 * mensajeDeError(err, porOmision) traduce cualquier fallo de red o del
 * servidor a una frase para el usuario, en vez de dejar el rastro solo en
 * la consola.
 */
import client from './client';
import {
  TIEMPO_MAXIMO_TRANSFERENCIA_MS,
  TRANSFERENCIA_SIN_AVANCE_MS,
  TIEMPO_PROCESO_MS,
  TAMANO_MAXIMO_SUBIDA_MB,
  TAMANO_MAXIMO_SUBIDA_BYTES,
} from './limites';

export const ERROR_SIN_AVANCE = 'PSPP_SIN_AVANCE';
export const ERROR_DEMASIADO_GRANDE = 'PSPP_ARCHIVO_DEMASIADO_GRANDE';

function minutos(ms) {
  const m = Math.round(ms / 60000);
  return m === 1 ? '1 minuto' : `${m} minutos`;
}

/**
 * @param {import('axios').AxiosRequestConfig} config  method, url, data...
 * @param {{direccion?: 'subida'|'bajada', onProgreso?: (f: number|null) => void, signal?: AbortSignal}} opciones
 */
export async function transferir(config, { direccion = 'subida', onProgreso, signal } = {}) {
  const ctrl = new AbortController();
  let estancada = false;
  let vigilante = null;

  const desarmar = () => { if (vigilante) clearTimeout(vigilante); vigilante = null; };
  const rearmar = () => {
    desarmar();
    vigilante = setTimeout(() => { estancada = true; ctrl.abort(); }, TRANSFERENCIA_SIN_AVANCE_MS);
  };

  const alCancelarExterno = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', alCancelarExterno, { once: true });
  }

  const alAvanzar = (e) => {
    const fraccion = e.total ? Math.min(1, e.loaded / e.total) : null;
    if (direccion === 'subida' && fraccion === 1) desarmar();
    else rearmar();
    onProgreso?.(fraccion);
  };

  rearmar();
  try {
    return await client.request({
      ...config,
      timeout: TIEMPO_MAXIMO_TRANSFERENCIA_MS,
      signal: ctrl.signal,
      ...(direccion === 'subida' ? { onUploadProgress: alAvanzar } : { onDownloadProgress: alAvanzar }),
    });
  } catch (err) {
    if (estancada) {
      err.code = ERROR_SIN_AVANCE;
    }
    throw err;
  } finally {
    desarmar();
    if (signal) signal.removeEventListener('abort', alCancelarExterno);
  }
}

/**
 * POST multipart de un archivo con avance. Rechaza en el navegador, antes
 * de mandar nada, un archivo más grande que el máximo del servidor.
 */
export async function subirArchivo(url, formData, archivo, { onProgreso, signal } = {}) {
  if (archivo && archivo.size > TAMANO_MAXIMO_SUBIDA_BYTES) {
    const err = new Error(`El archivo excede ${TAMANO_MAXIMO_SUBIDA_MB} MB`);
    err.code = ERROR_DEMASIADO_GRANDE;
    throw err;
  }
  const { data } = await transferir({ method: 'post', url, data: formData }, { direccion: 'subida', onProgreso, signal });
  return data;
}

// Para operaciones donde el servidor procesa antes de contestar.
export const conTiempoDeProceso = (config = {}) => ({ ...config, timeout: TIEMPO_PROCESO_MS });

/**
 * Frase para el usuario a partir de cualquier error de axios (o de
 * transferir/subirArchivo). `porOmision` se usa solo si no hay nada mejor.
 */
export function mensajeDeError(err, porOmision = 'No se pudo completar la operación.') {
  if (!err) return porOmision;
  if (err.code === ERROR_DEMASIADO_GRANDE) {
    return `El archivo pesa más de ${TAMANO_MAXIMO_SUBIDA_MB} MB, el máximo permitido.`;
  }
  if (err.code === ERROR_SIN_AVANCE) {
    return `La transferencia dejó de avanzar durante más de ${Math.round(TRANSFERENCIA_SIN_AVANCE_MS / 1000)} segundos. Revisa tu conexión e inténtalo de nuevo.`;
  }
  if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
    return 'La operación se canceló.';
  }
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
    const limite = err.config?.timeout;
    return limite
      ? `La operación tardó más de ${limite >= 60000 ? minutos(limite) : `${Math.round(limite / 1000)} segundos`} y se canceló. Inténtalo de nuevo; si se repite, avisa a soporte.`
      : 'La operación tardó demasiado y se canceló.';
  }

  const estado = err.response?.status;
  if (!err.response) {
    return 'Se perdió la conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  }
  // Mensaje del propio backend (JSON). Con responseType 'blob' no se lee.
  const delServidor = typeof err.response.data?.mensaje === 'string' ? err.response.data.mensaje : null;
  if (estado === 413) {
    // Puede venir de nginx (HTML, sin mensaje) o del backend.
    return `El archivo excede el tamaño máximo que acepta el servidor (${TAMANO_MAXIMO_SUBIDA_MB} MB).`;
  }
  if (delServidor) return delServidor;
  if (estado === 408) return 'El servidor cortó la petición porque tardó demasiado en llegar. Inténtalo de nuevo.';
  if (estado === 403) return 'No tienes permiso para realizar esta operación.';
  if (estado === 404) return 'No se encontró lo que se buscaba; puede que ya no exista.';
  if (estado === 502 || estado === 503) return 'El servidor no está disponible en este momento. Inténtalo en unos minutos.';
  if (estado === 504) return 'El servidor tardó demasiado en responder. Inténtalo de nuevo; si se repite, avisa a soporte.';
  return porOmision;
}
