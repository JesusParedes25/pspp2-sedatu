/**
 * ARCHIVO: transmitirObjeto.js
 * PROPÓSITO: Transmitir un objeto del almacén al navegador, por flujo,
 *            desde el propio backend. Es la única forma en que un archivo
 *            almacenado llega al navegador: el almacén es un servicio
 *            interno que no se publica, no se generan URLs firmadas ni
 *            temporales, y el navegador nunca habla con él.
 *
 * NOTA TÉCNICA: qué resuelve y qué NO resuelve este módulo
 * ─────────────────────────────────────────────────────────────────
 * NO decide permisos. Quien lo llama ya validó, antes de llegar aquí,
 * que el usuario puede ver la evidencia (middleware de visibilidad de la
 * ruta) y le pasa la clave que sacó de la BD para ESE registro. La clave
 * nunca viene del cliente: conocer el nombre de un objeto no sirve para
 * pedirlo.
 *
 * Sí resuelve todo lo de transporte:
 *   1. statObject primero. Si el objeto no existe responde 404 limpio,
 *      antes de haber escrito un solo header. Antes el 404 del almacén
 *      llegaba como 500 (los headers ya estaban puestos cuando getObject
 *      fallaba).
 *   2. Range (RFC 9110 §14): un solo rango "bytes=a-b", "bytes=a-" o
 *      "bytes=-n" → 206 con Content-Range, pidiendo al almacén solo ese
 *      tramo (getPartialObject). Un rango imposible → 416. Varios rangos
 *      a la vez (multipart/byteranges) no se soportan: se responde el
 *      archivo completo con 200, que la RFC permite y que los visores de
 *      PDF manejan bien. If-Range con un ETag que ya no coincide también
 *      cae a 200 completo, para no mezclar tramos de dos versiones.
 *   3. Nunca se carga el archivo en memoria: el flujo del almacén se
 *      conecta al response con stream.pipeline, que respeta la
 *      contrapresión (si el navegador lee lento, se le pide menos al
 *      almacén) y que, ante un error de cualquiera de los dos lados,
 *      destruye ambos.
 *   4. Cierre anticipado: si el navegador cierra la conexión (cancela la
 *      descarga, cierra la pestaña, el visor de PDF aborta un rango que
 *      ya no necesita), pipeline destruye el flujo del almacén, lo que
 *      corta la petición HTTP interna. Si el cierre ocurre mientras se
 *      espera al almacén, el flujo se destruye en cuanto llega, sin
 *      leerlo. No queda ningún socket colgado hacia el almacén.
 * ─────────────────────────────────────────────────────────────────
 */
const { pipeline } = require('stream');
const { almacen, esObjetoInexistente } = require('./minio');
const { setContentDisposition } = require('./contentDisposition');

// Tipos que el navegador muestra sin ejecutar nada. Para cualquier otro
// tipo (HTML, SVG, XML...) se agrega `Content-Security-Policy: sandbox`:
// estos archivos los sube cualquier usuario con permiso de captura y se
// sirven desde el MISMO origen que la aplicación, así que un HTML o SVG
// con <script> abierto en una pestaña correría con la sesión de quien lo
// abre. PDF queda fuera de la lista negra a propósito: el visor de PDF de
// Chrome se niega a renderizar un documento con CSP sandbox.
const TIPOS_SIN_SANDBOX = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp)|audio\/|video\/)/i;

/**
 * Interpreta el header Range contra el tamaño del objeto.
 * @returns {null} si no hay rango utilizable (responder 200 completo),
 *          {inicio, fin} inclusivo, o {invalido: true} para 416.
 */
function interpretarRango(header, tamano) {
  if (!header || typeof header !== 'string') return null;
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!m) return null; // unidad desconocida: se ignora, como pide la RFC
  if (m[1].includes(',')) return null; // multi-rango: se sirve completo

  const r = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(m[1]);
  if (!r || (r[1] === '' && r[2] === '')) return { invalido: true };

  if (tamano === 0) return { invalido: true };

  let inicio;
  let fin;
  if (r[1] === '') {
    // Sufijo: los últimos n bytes.
    const n = Number(r[2]);
    if (n === 0) return { invalido: true };
    inicio = Math.max(0, tamano - n);
    fin = tamano - 1;
  } else {
    inicio = Number(r[1]);
    fin = r[2] === '' ? tamano - 1 : Math.min(Number(r[2]), tamano - 1);
    if (inicio >= tamano || fin < inicio) return { invalido: true };
  }
  return { inicio, fin };
}

function conexionCerrada(req, res) {
  return res.destroyed || res.writableEnded || req.destroyed || req.aborted;
}

function responder404(res, mensaje) {
  return res.status(404).json({ error: true, mensaje, codigo: 'ARCHIVO_NO_ENCONTRADO' });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 * @param {object} opciones
 * @param {string} opciones.clave         Clave lógica del objeto (de la BD).
 * @param {string} [opciones.nombre]      Nombre para Content-Disposition.
 * @param {string} [opciones.tipo]        Content-Type registrado en la BD.
 * @param {'inline'|'attachment'} [opciones.disposicion]
 * @param {string} [opciones.cacheControl]
 * @param {string} [opciones.mensaje404]
 */
async function transmitirObjeto(req, res, next, opciones) {
  const {
    clave,
    nombre = 'archivo',
    tipo,
    disposicion = 'attachment',
    cacheControl = 'private, no-cache',
    mensaje404 = 'El archivo ya no está disponible en el almacenamiento.',
  } = opciones;

  if (!clave) return responder404(res, mensaje404);

  let info;
  try {
    info = await almacen.statObject(clave);
  } catch (err) {
    if (esObjetoInexistente(err)) return responder404(res, mensaje404);
    return next(err);
  }
  if (conexionCerrada(req, res)) return undefined;

  const tamano = Number(info.size) || 0;
  const etag = info.etag ? `"${info.etag}"` : null;
  const contentType = tipo || info.metaData?.['content-type'] || 'application/octet-stream';

  // If-Range: solo se respeta el Range si el cliente tiene la misma
  // versión del objeto. Comparamos contra ETag (lo que mandamos nosotros);
  // una fecha en If-Range se trata como "no coincide" → 200 completo, que
  // siempre es una respuesta correcta.
  let rango = interpretarRango(req.headers.range, tamano);
  const ifRange = req.headers['if-range'];
  if (rango && ifRange && (!etag || ifRange.trim() !== etag)) rango = null;

  res.setHeader('Accept-Ranges', 'bytes');
  if (etag) res.setHeader('ETag', etag);
  if (info.lastModified instanceof Date && !isNaN(info.lastModified)) {
    res.setHeader('Last-Modified', info.lastModified.toUTCString());
  }
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (rango?.invalido) {
    res.setHeader('Content-Range', `bytes */${tamano}`);
    return res.status(416).json({
      error: true, mensaje: 'Rango solicitado fuera del archivo', codigo: 'RANGO_INVALIDO',
    });
  }

  res.setHeader('Content-Type', contentType);
  if (!TIPOS_SIN_SANDBOX.test(contentType)) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  }
  setContentDisposition(res, nombre, disposicion);

  const longitud = rango ? rango.fin - rango.inicio + 1 : tamano;
  res.setHeader('Content-Length', String(longitud));
  if (rango) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${rango.inicio}-${rango.fin}/${tamano}`);
  } else {
    res.status(200);
  }

  // HEAD (Express enruta HEAD a los handlers GET) y archivos vacíos: no
  // hay cuerpo que pedir al almacén.
  if (req.method === 'HEAD' || longitud === 0) return res.end();

  let flujo;
  try {
    flujo = rango
      ? await almacen.getPartialObject(clave, rango.inicio, longitud)
      : await almacen.getObject(clave);
  } catch (err) {
    // Carrera: el objeto existía en el stat y ya no. Los headers todavía
    // no se mandaron (solo se fijaron), así que aún se puede dar un 404.
    if (!res.headersSent) {
      for (const h of ['Content-Length', 'Content-Range', 'Content-Disposition', 'Content-Type', 'ETag', 'Last-Modified', 'Content-Security-Policy']) {
        res.removeHeader(h);
      }
      if (esObjetoInexistente(err)) return responder404(res, mensaje404);
      return next(err);
    }
    res.destroy(err);
    return undefined;
  }

  // El navegador se fue mientras esperábamos al almacén: no leer nada.
  if (conexionCerrada(req, res)) {
    flujo.destroy();
    return undefined;
  }

  pipeline(flujo, res, (err) => {
    if (!err) return;
    // ERR_STREAM_PREMATURE_CLOSE = el navegador cerró la conexión. Es el
    // caso normal de un visor de PDF que cancela un rango o de un usuario
    // que cancela la descarga; no es un error del servidor.
    if (err.code === 'ERR_STREAM_PREMATURE_CLOSE' || conexionCerrada(req, res)) return;
    console.error(`✗ Error transmitiendo objeto "${clave}":`, err.message);
    // pipeline ya destruyó ambos lados; si los headers no salieron aún,
    // res.destroy deja que el cliente vea la conexión cortada en lugar de
    // un 200 truncado que parezca un archivo completo.
    if (!res.destroyed) res.destroy(err);
  });
  return undefined;
}

module.exports = { transmitirObjeto, interpretarRango };
