/**
 * ARCHIVO: etiquetas-funcion.js
 * PROPÓSITO: Etiqueta visible de cada peldaño asignable del modelo de
 *            permisos — captura/responsable/lectura
 *            (`administracion_proyecto` no se asigna aquí, se
 *            transfiere, ver miembros.queries.js::transferirAdministracion).
 *
 * Usada en notificaciones dentro de la plataforma (crearNotificacion) y
 * en el correo de aviso de asignación
 * (frontend/src/utils/correoAsignacion.js), para que los dos canales
 * digan exactamente lo mismo sobre la misma persona — "Solo lectura",
 * no "invitado" ni el valor crudo "lectura".
 */
const ETIQUETA_FUNCION = {
  captura: 'Colaborador',
  responsable: 'Responsable',
  lectura: 'Solo lectura',
};

function etiquetaFuncion(funcion) {
  return ETIQUETA_FUNCION[funcion] || funcion;
}

module.exports = { ETIQUETA_FUNCION, etiquetaFuncion };
