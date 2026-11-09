/**
 * ARCHIVO: configuracion.js
 * PROPÓSITO: Verificar al arranque las variables sin las cuales el backend
 *            no puede funcionar y que, si faltan, NO producen un error
 *            claro por sí solas.
 *
 * Hoy es una sola: JWT_SECRET. Sin ella el backend arrancaba "bien" y
 * después el login respondía 500 ("secretOrPrivateKey must have a value")
 * y toda petición autenticada 401 "Token inválido", sin decir nunca que
 * faltaba la variable. Además firma, por derivación, los boletos de
 * descarga (utils/boletoArchivo.js). Las variables de la base de datos no
 * se revisan aquí: si faltan, la conexión de migraciones falla al arrancar
 * con su propio mensaje.
 */
function variablesObligatoriasFaltantes(env = process.env) {
  const faltantes = [];
  if (!env.JWT_SECRET || !String(env.JWT_SECRET).trim()) faltantes.push('JWT_SECRET');
  return faltantes;
}

module.exports = { variablesObligatoriasFaltantes };
