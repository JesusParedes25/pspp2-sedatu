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
  const statusCode = err.statusCode || 500;

  // Respuesta JSON consistente para el frontend
  res.status(statusCode).json({
    error: true,
    mensaje: err.message || 'Error interno del servidor',
    codigo: err.codigo || 'INTERNAL_ERROR',
    // Solo mostrar detalles en desarrollo
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
