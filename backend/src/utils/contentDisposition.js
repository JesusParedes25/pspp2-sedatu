/**
 * ARCHIVO: contentDisposition.js
 * PROPÓSITO: Construir el header Content-Disposition sin corromper
 *            nombres de archivo con acentos, ñ o signos como ¿/¡.
 *
 * MINI-CLASE: por qué "filename=" solo no basta
 * ─────────────────────────────────────────────────────────────────
 * Los headers HTTP solo admiten Latin-1 puro (RFC 7230). Node no lo
 * valida al escribir el header: si el string tiene un carácter fuera de
 * ese rango, cada code unit se trunca a un byte y el resultado es
 * basura ("Regularización" sale como "Regularizaci�n"). Es justo lo que
 * pasaba con las exportaciones y con la descarga de evidencias —
 * cualquier nombre de proyecto o de archivo con acento llegaba
 * corrompido al navegador.
 *
 * La solución estándar (RFC 6266 + RFC 5987) es mandar el nombre dos
 * veces: `filename="<respaldo ASCII>"` para clientes viejos que no
 * saben leer la otra forma, y `filename*=UTF-8''<percent-encoded>` con
 * el nombre real, que es el que todo navegador moderno usa cuando está
 * presente. Ningún navegador actual junta las dos por separado; leen
 * `filename*` si lo entienden y si no, caen al respaldo.
 *
 * De paso se quita cualquier salto de línea del nombre — sin eso, un
 * nombre de archivo con \r\n (nunca debería llegar así, pero viene de
 * datos que el usuario controla: el nombre del archivo que subió, o el
 * nombre del proyecto) podría inyectar headers HTTP adicionales.
 * ─────────────────────────────────────────────────────────────────
 */

// Solo para el respaldo ASCII: cambia los acentos/ñ más comunes del
// español por su letra base. No pretende cubrir todos los alfabetos —
// para eso está filename*, que si lleva el nombre exacto en UTF-8. Este
// respaldo solo tiene que ser legible para el puñado de clientes que
// ignoran filename*.
const TRANSLITERACION = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N',
};

function nombreDeRespaldo(nombre) {
  const sinAcentos = nombre.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, c => TRANSLITERACION[c] || c);
  return sinAcentos
    .replace(/[\r\n]/g, ' ')
    // Fuera de ASCII imprimible y sin comillas/backslash, que romperían
    // la sintaxis de filename="...".
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim() || 'archivo';
}

// RFC 5987: encodeURIComponent ya escapa lo esencial; faltan unos pocos
// caracteres que la RFC pide escapar y que encodeURIComponent deja tal
// cual porque son válidos en una URI pero no en este contexto.
function percentEncodeRFC5987(nombre) {
  return encodeURIComponent(nombre.replace(/[\r\n]/g, ' '))
    .replace(/['()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

/**
 * Pone el header Content-Disposition con el nombre de archivo correcto
 * sin importar qué acentos o símbolos traiga.
 *
 * @param {import('express').Response} res
 * @param {string} nombreArchivo  Nombre real, con acentos si los tiene.
 * @param {'attachment'|'inline'} tipo
 */
function setContentDisposition(res, nombreArchivo, tipo = 'attachment') {
  const respaldo = nombreDeRespaldo(nombreArchivo);
  const codificado = percentEncodeRFC5987(nombreArchivo);
  res.setHeader('Content-Disposition',
    `${tipo}; filename="${respaldo}"; filename*=UTF-8''${codificado}`);
}

module.exports = { setContentDisposition };
