/**
 * ARCHIVO: redaccion-contenido-trabajo.js
 * PROPÓSITO: paso 14 DGTIC — seis endpoints agregados de proyecto
 *            (estadísticas, portada, actividad reciente, bitácora,
 *            panorama y panorama rápido) y uno de nodo (stream de
 *            actividad) mezclan seguimiento (avance, conteos, estado —
 *            abierto a cualquier interno) con contenido de trabajo
 *            (texto de comentarios, descripción/título de riesgos,
 *            nombre de archivo de evidencias — acotado a quien participa,
 *            ver docs/modelo-permisos.md 5.1). En vez de bloquear esos
 *            endpoints enteros (perdería el detalle para quien sí
 *            participa, que es justo quien lo necesita), se redacta solo
 *            el campo de contenido cuando falta participación.
 *
 * `tieneParticipacion` se resuelve UNA sola vez por petición, en el
 * controller (puedeVerContenidoProyecto/puedeVerContenidoNodo,
 * utils/autorizacion.js), y se pasa como booleano hacia la capa de
 * consulta — nunca se vuelve a verificar aquí ni dentro de cada query.
 * `redactar` es el único lugar que decide CÓMO se ve "sin participación"
 * (null, no string vacío ni se quita la llave) para que esa forma sea
 * idéntica en los 5 puntos donde se aplica.
 */
function redactar(valor, tieneParticipacion) {
  return tieneParticipacion ? valor : null;
}

module.exports = { redactar };
