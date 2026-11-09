/**
 * ARCHIVO: errorHandler.js
 * PROPÓSITO: Middleware centralizado de manejo de errores para Express.
 *
 * NOTA TÉCNICA: Error handling middleware en Express
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

// Errores de multer (recepción de archivos). Sin este mapeo caían al 500
// genérico con el mensaje en inglés de multer ("File too large"): el
// usuario veía "Error interno" por algo que es un límite conocido.
const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: { status: 413, codigo: 'ARCHIVO_DEMASIADO_GRANDE', mensaje: 'El archivo excede el tamaño máximo permitido.' },
  LIMIT_FILE_COUNT: { status: 400, codigo: 'DEMASIADOS_ARCHIVOS', mensaje: 'Se enviaron más archivos de los permitidos.' },
  LIMIT_UNEXPECTED_FILE: { status: 400, codigo: 'CAMPO_ARCHIVO_INESPERADO', mensaje: 'El archivo llegó en un campo que no se esperaba.' },
};

// Middleware de error — siempre va ÚLTIMO en la cadena de app.use()
function errorHandler(err, req, res, next) {
  if (err && err.name === 'MulterError') {
    const m = MENSAJES_MULTER[err.code] || { status: 400, codigo: 'SUBIDA_INVALIDA', mensaje: 'La subida del archivo no es válida.' };
    console.error('─── Subida rechazada ───', req.method, req.originalUrl, err.code);
    if (res.headersSent) return next(err);
    return res.status(m.status).json({ error: true, mensaje: m.mensaje, codigo: m.codigo });
  }

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
