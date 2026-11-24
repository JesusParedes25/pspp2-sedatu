/**
 * ARCHIVO: erroresPermisos.js
 * PROPÓSITO: paso 14 DGTIC — distinguir, en un error de axios, el rechazo
 *            "no participas en este proyecto/nodo" (codigo SIN_PARTICIPACION,
 *            backend/src/utils/alcance-lectura.js) del resto de errores
 *            (incluido el viejo NO_AUTORIZADO de visibilidad). El
 *            frontend necesita esta distinción para mostrar "contenido
 *            reservado" en vez de tratarlo como una lista vacía o un
 *            error genérico.
 */
export function esSinParticipacion(err) {
  return err?.response?.status === 403 && err?.response?.data?.codigo === 'SIN_PARTICIPACION';
}
