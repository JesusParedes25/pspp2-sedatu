/**
 * ARCHIVO: corregirCodificacionArchivo.middleware.js
 * PROPÓSITO: Usar después de upload.single(...) (multer) en cualquier ruta
 *            que suba un archivo — corrige req.file.originalname cuando
 *            llegó con acentos corrompidos.
 *
 * MINI-CLASE: por qué "validación.pdf" llega como "validaciÃ³n.pdf"
 * ─────────────────────────────────────────────────────────────────
 * El navegador manda el nombre de archivo como UTF-8 dentro del header
 * multipart, pero busboy (la librería que usa multer para parsear
 * multipart/form-data) lo decodifica como latin1 por compatibilidad
 * histórica con RFC 2388, que nunca estandarizó el charset de ese campo.
 * Cada carácter acentuado ocupa 2 bytes en UTF-8 (p. ej. "ó" = 0xC3 0xB3);
 * decodificados como latin1 esos 2 bytes se vuelven 2 caracteres sueltos
 * ("Ã" + "³"), que es exactamente el patrón que reportó QA.
 *
 * El arreglo revierte esa decodificación: toma la cadena tal como la
 * entregó busboy y reinterpreta cada uno de sus caracteres como un byte
 * latin1 (recupera los bytes UTF-8 originales), luego los decodifica como
 * UTF-8. Para nombres puramente ASCII (la mayoría) esto no cambia nada —
 * ASCII es un subconjunto válido de UTF-8 — así que es seguro aplicarlo
 * siempre, sin necesidad de detectar primero si el nombre está afectado.
 * ─────────────────────────────────────────────────────────────────
 */
function corregirCodificacionArchivo(req, res, next) {
  if (req.file?.originalname) {
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  }
  next();
}

module.exports = corregirCodificacionArchivo;
