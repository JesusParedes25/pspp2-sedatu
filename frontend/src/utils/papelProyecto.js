/**
 * ARCHIVO: papelProyecto.js
 * PROPÓSITO: Responder, para un proyecto y el usuario actual, la única
 *            pregunta que la gente se hace: "¿qué soy yo aquí y qué
 *            puedo hacer?".
 *
 * MINI-CLASE: por qué esto vive en un solo lugar
 * ─────────────────────────────────────────────────────────────────
 * Hasta ahora, saber si podías editar un proyecto exigía resolver
 * mentalmente cuatro cosas: tu rol global, si tu DG coincide con la
 * que lidera, si lo creaste y si eres responsable. El resultado no se
 * mostraba en ningún lado — solo aparecía o desaparecía un botón, y
 * el usuario tenía que deducir por qué.
 *
 * Aquí se calcula una vez y se traduce a una etiqueta legible. La
 * regla es EXACTAMENTE la que aplica el backend (autorizacion.js):
 * si las dos se separan, el usuario ve un botón que al pulsarlo
 * falla, que es la peor experiencia posible.
 * ─────────────────────────────────────────────────────────────────
 */

// Papeles, del más al menos capaz. El orden importa: se devuelve el
// primero que aplique.
export const PAPEL = {
  RESPONSABLE: 'responsable',
  COLABORADOR: 'colaborador',
  POR_CARGO: 'por_cargo',   // puede editar por su puesto, no porque participe
  LECTOR: 'lector',
};

export const ETIQUETA_PAPEL = {
  [PAPEL.RESPONSABLE]: 'Responsable',
  [PAPEL.COLABORADOR]: 'Colaborador',
  [PAPEL.POR_CARGO]: 'Editas por tu cargo',
  [PAPEL.LECTOR]: 'Solo lectura',
};

export const DESCRIPCION_PAPEL = {
  [PAPEL.RESPONSABLE]: 'Puedes editar el proyecto, invitar participantes y eliminarlo.',
  [PAPEL.COLABORADOR]: 'Participas en este proyecto: puedes capturar avances, comentar y subir evidencias.',
  [PAPEL.POR_CARGO]: 'No participas en este proyecto, pero tu cargo te permite editarlo.',
  [PAPEL.LECTOR]: 'Puedes consultar todo el proyecto, pero no modificarlo.',
};

// Clases de color por papel. Guinda para quien manda, azul para quien
// participa, ámbar para el permiso que viene del puesto (que conviene
// que se note distinto), gris para la consulta.
export const COLOR_PAPEL = {
  [PAPEL.RESPONSABLE]: 'bg-guinda-50 text-guinda-700 border-guinda-200',
  [PAPEL.COLABORADOR]: 'bg-blue-50 text-blue-700 border-blue-200',
  [PAPEL.POR_CARGO]: 'bg-amber-50 text-amber-700 border-amber-200',
  [PAPEL.LECTOR]: 'bg-gray-50 text-gray-500 border-gray-200',
};

/**
 * @param {object} proyecto  necesita id_creador, id_dg_lider y, si se
 *                           conoce, rol_usuario_actual (o mi_rol_proyecto
 *                           en el listado)
 * @param {object} usuario   el usuario autenticado
 */
export function calcularPapel(proyecto, usuario) {
  if (!proyecto || !usuario) return PAPEL.LECTOR;

  const rolProyecto = proyecto.rol_usuario_actual || proyecto.mi_rol_proyecto || null;
  const esCreador = usuario.id === proyecto.id_creador;
  const esMismaDG = !!usuario.id_dg && usuario.id_dg === proyecto.id_dg_lider;

  if (esCreador || rolProyecto === 'responsable') return PAPEL.RESPONSABLE;

  // El superadmin administra la plataforma y el ejecutivo da seguimiento a
  // toda la Secretaría: ninguno de los dos "participa" en el proyecto, así
  // que decir "Responsable" sería mentir. Un director sobre un proyecto de
  // su propia DG está en la misma situación.
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return PAPEL.POR_CARGO;
  if (usuario.rol === 'direccion' && esMismaDG) return PAPEL.POR_CARGO;

  if (rolProyecto === 'colaborador') return PAPEL.COLABORADOR;

  return PAPEL.LECTOR;
}

// ¿Participa de verdad en el proyecto? Es lo que responde el filtro
// "Donde participo": tener permiso por el cargo no es participar.
export function participaEn(proyecto, usuario) {
  const papel = calcularPapel(proyecto, usuario);
  return papel === PAPEL.RESPONSABLE || papel === PAPEL.COLABORADOR;
}
