/**
 * ARCHIVO: errorHandler.js
 * PROPÓSITO: Middleware centralizado de manejo de errores para Express.
 *
 * MINI-CLASE: Error handling middleware en Express
 * ─────────────────────────────────────────────────────────────────
 * Express reconoce un middleware de error por tener 4 parámetros:
 * (err, req, res, next). Cuando cualquier ruta hace throw o llama
 * next(error), Express salta todos los middlewares normales y va
 * directo al primer middleware de error. Esto centraliza el manejo:
 * en lugar de try/catch en cada ruta, las rutas solo hacen throw
 * y este middleware formatea la respuesta JSON de error.
 * ─────────────────────────────────────────────────────────────────
 */

// Mapeo de códigos de error de Postgres a status HTTP apropiados.
// Sin esto, cualquier violación de constraint (ej. la regla territorial
// exclusiva de la migración 037) cae al 500 genérico por defecto.
const PG_ERROR_STATUS = {
  '23505': 409, // unique_violation
  '23503': 400, // foreign_key_violation
  '23514': 400, // check_violation
  '22P02': 400, // invalid_text_representation
};

const MENSAJES_CONSTRAINT = {
  etapas_territorio_exclusivo: 'Un nodo no puede tener Zona Metropolitana y Estado/Municipio al mismo tiempo.',
  acciones_territorio_exclusivo: 'Un nodo no puede tener Zona Metropolitana y Estado/Municipio al mismo tiempo.',
};

// Middleware de error — siempre va ÚLTIMO en la cadena de app.use()
function errorHandler(err, req, res, next) {
  // Loguear el error completo en consola para debugging
  console.error('─── Error capturado ───');
  console.error('Ruta:', req.method, req.originalUrl);
  console.error('Mensaje:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack:', err.stack);
  }

  // Determinar el código HTTP apropiado
  const statusCode = err.statusCode || PG_ERROR_STATUS[err.code] || 500;
  const mensaje = MENSAJES_CONSTRAINT[err.constraint] || err.message || 'Error interno del servidor';

  // Respuesta JSON consistente para el frontend
  res.status(statusCode).json({
    error: true,
    mensaje,
    codigo: err.codigo || (err.constraint ? err.constraint.toUpperCase() : 'INTERNAL_ERROR'),
    // Solo mostrar detalles en desarrollo
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
