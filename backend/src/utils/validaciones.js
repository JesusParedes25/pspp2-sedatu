/**
 * ARCHIVO: validaciones.js
 * PROPÓSITO: Funciones de validación reutilizables para los controllers.
 *
 * MINI-CLASE: Validación en el backend
 * ─────────────────────────────────────────────────────────────────
 * Aunque el frontend también valida, el backend SIEMPRE debe validar
 * de nuevo. Un atacante puede enviar peticiones directamente con curl
 * o Postman saltando toda validación del frontend. Estas funciones
 * lanzan errores con statusCode para que el errorHandler los capture
 * y devuelva el código HTTP correcto (400 para datos inválidos,
 * 404 para no encontrado, etc.).
 * ─────────────────────────────────────────────────────────────────
 */

// Valida que los campos requeridos estén presentes en el body
function validarCamposRequeridos(body, campos) {
  const faltantes = campos.filter(campo => {
    const valor = body[campo];
    return valor === undefined || valor === null || valor === '';
  });

  if (faltantes.length > 0) {
    const error = new Error(`Campos requeridos faltantes: ${faltantes.join(', ')}`);
    error.statusCode = 400;
    error.codigo = 'CAMPOS_REQUERIDOS';
    throw error;
  }
}

// Valida que un UUID tenga formato correcto
function validarUUID(valor, nombreCampo) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(valor)) {
    const error = new Error(`${nombreCampo} no es un UUID válido: ${valor}`);
    error.statusCode = 400;
    error.codigo = 'UUID_INVALIDO';
    throw error;
  }
}

// Valida que un valor esté dentro de una lista de opciones permitidas
function validarEnum(valor, opciones, nombreCampo) {
  if (!opciones.includes(valor)) {
    const error = new Error(
      `${nombreCampo} debe ser uno de: ${opciones.join(', ')}. Recibido: ${valor}`
    );
    error.statusCode = 400;
    error.codigo = 'VALOR_INVALIDO';
    throw error;
  }
}

// Valida que un porcentaje esté entre 0 y 100
function validarPorcentaje(valor, nombreCampo) {
  const numero = parseFloat(valor);
  if (isNaN(numero) || numero < 0 || numero > 100) {
    const error = new Error(`${nombreCampo} debe estar entre 0 y 100. Recibido: ${valor}`);
    error.statusCode = 400;
    error.codigo = 'PORCENTAJE_INVALIDO';
    throw error;
  }
  return numero;
}

// Lanza un error 404 con mensaje descriptivo
function noEncontrado(entidad, id) {
  const error = new Error(`${entidad} no encontrado(a) con id: ${id}`);
  error.statusCode = 404;
  error.codigo = 'NO_ENCONTRADO';
  throw error;
}

module.exports = {
  validarCamposRequeridos,
  validarUUID,
  validarEnum,
  validarPorcentaje,
  noEncontrado
};
