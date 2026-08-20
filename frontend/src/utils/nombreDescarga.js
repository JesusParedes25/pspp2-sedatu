/**
 * ARCHIVO: nombreDescarga.js
 * PROPÓSITO: Extraer el nombre de archivo de un header Content-Disposition
 *            cuando la descarga se hace por blob (axios) y no por
 *            navegación directa del navegador.
 *
 * MINI-CLASE: por qué esto no lo resuelve el navegador solo
 * ─────────────────────────────────────────────────────────────────
 * Si el navegador navegara directo a la URL del archivo (un <a href>
 * normal), él mismo leería el Content-Disposition y elegiría el nombre
 * correcto sin que el frontend haga nada. Pero como la descarga se
 * arma con axios (necesario porque el request lleva el JWT en un
 * header, y un <a href> normal no puede mandar headers), es este código
 * el que tiene que parsear el Content-Disposition a mano.
 *
 * El backend manda el nombre dos veces (ver contentDisposition.js del
 * backend): `filename="<respaldo ASCII>"` y
 * `filename*=UTF-8''<nombre real, percent-encoded>`. Si aquí solo se
 * busca `filename="..."`, el resultado es siempre el respaldo sin
 * acentos ni ñ, aunque el archivo en sí esté perfecto — el nombre
 * "Regularización..." se ve como "Regularizacion..." en cuanto se
 * guarda. Por eso `filename*` se busca primero.
 * ─────────────────────────────────────────────────────────────────
 */
export function nombreDeContentDisposition(header, fallback) {
  if (!header) return fallback;

  const conAcentos = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (conAcentos) {
    try {
      return decodeURIComponent(conAcentos[1].trim());
    } catch {
      // percent-encoding corrupto: cae al respaldo de abajo
    }
  }

  const simple = header.match(/filename="([^"]+)"/);
  return simple ? simple[1] : fallback;
}
