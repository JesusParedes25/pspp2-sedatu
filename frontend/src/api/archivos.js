/**
 * ARCHIVO: archivos.js
 * PROPÓSITO: Abrir y descargar archivos almacenados (evidencias y adjuntos
 *            de tareas) SIN poner el token de sesión en ninguna URL.
 *
 * NOTA TÉCNICA: dos vías, según quién hace la petición
 * ─────────────────────────────────────────────────────────────────
 * Antes las URLs llevaban ?token=<JWT de sesión de 48 h>, que quedaba
 * escrito en la bitácora de cada proxy que registra URLs (en SEDATU: F5,
 * nginx institucional y contenedor). El backend ya no lo acepta.
 *
 * 1. Vista previa → obtenerContenido(): la pide axios, con la cabecera
 *    Authorization, y entrega un Blob. El visor (PDF, imagen, audio) recibe
 *    una URL blob: local del navegador, que no viaja por la red ni caduca.
 *    Se hace así y no con un boleto en el src del <iframe> porque el visor
 *    de PDF sigue pidiendo rangos por su cuenta mientras el documento
 *    carga: con un PDF grande o un enlace lento esas peticiones llegarían
 *    con el boleto (60 s) ya vencido y el documento quedaría a medias.
 *
 * 2. Descarga → descargar(): el navegador tiene que hacer la petición él
 *    mismo (para que el archivo vaya al gestor de descargas sin pasar por
 *    memoria), así que no puede mandar la cabecera. Se pide un boleto
 *    efímero justo antes (POST con la cabecera normal) y se navega a la
 *    URL con ?boleto=. Es una sola petición: el boleto se valida al
 *    empezar, y una descarga larga termina aunque caduque a la mitad.
 *
 * `fuente` identifica el objeto: { tipo: 'evidencia' | 'actividad', id }.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';
import { transferir } from './transferencias';

const RUTA_POR_TIPO = { evidencia: 'evidencias', actividad: 'actividad' };

function rutaBase(fuente) {
  const ruta = RUTA_POR_TIPO[fuente?.tipo];
  if (!ruta || !fuente.id) throw new Error('Archivo sin identificar');
  return `/${ruta}/${encodeURIComponent(fuente.id)}`;
}

/**
 * Pide un boleto efímero y devuelve la URL absoluta (con la base de la API)
 * lista para que el navegador la abra. accion: 'ver' | 'descargar'.
 */
export async function obtenerUrlConBoleto(fuente, accion) {
  const { data } = await client.post(`${rutaBase(fuente)}/boleto`, { accion });
  return `${client.defaults.baseURL}${data.datos.ruta}`;
}

/**
 * Contenido del archivo para la vista previa, como Blob, autenticado con
 * la cabecera de sesión. onProgreso(fraccion 0..1 | null), signal
 * (AbortController) y rango son opcionales.
 */
export async function obtenerContenido(fuente, { onProgreso, signal, rango } = {}) {
  // transferir(): un PDF o audio grande por un enlace lento tarda más de
  // los 30 s de una petición normal; aquí solo falla si deja de avanzar.
  const { data } = await transferir({
    method: 'get',
    url: `${rutaBase(fuente)}/ver`,
    responseType: 'blob',
    // rango: [inicio, fin] en bytes, inclusivo. El backend responde 206 con
    // solo ese tramo (o 200 completo si el archivo es más chico).
    headers: rango ? { Range: `bytes=${rango[0]}-${rango[1]}` } : undefined,
  }, { direccion: 'bajada', onProgreso, signal });
  return data;
}

/**
 * Lanza la descarga del archivo con un boleto recién emitido. El archivo
 * llega con Content-Disposition: attachment, así que el navegador lo
 * guarda sin salir de la página.
 */
export async function descargar(fuente) {
  const url = await obtenerUrlConBoleto(fuente, 'descargar');
  const a = document.createElement('a');
  a.href = url;
  // Con `download`, si algo fallara del lado del servidor el navegador
  // marca la descarga como fallida en vez de navegar fuera de la app.
  a.download = '';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Fuente de una evidencia "clásica" (tabla evidencias).
export const fuenteEvidencia = (id) => ({ tipo: 'evidencia', id });
// Fuente de un adjunto del stream de actividad (tareas).
export const fuenteActividad = (id) => ({ tipo: 'actividad', id });
