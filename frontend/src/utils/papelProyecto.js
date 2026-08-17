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
//
// El texto se dirige al usuario y le dice directamente qué puede hacer.
// Directo no es informal: se evita tanto el lenguaje coloquial como la
// redacción de oficio que nadie lee.
export const PAPEL = {
  RESPONSABLE: 'responsable',
  COLABORADOR: 'colaborador',
  ATRIBUCION: 'atribucion',    // edita por su cargo, sin participar en el proyecto
  SEGUIMIENTO: 'seguimiento',  // consulta y designa participantes, sin editar
  LECTOR: 'lector',
};

export const ETIQUETA_PAPEL = {
  [PAPEL.RESPONSABLE]: 'Responsable',
  [PAPEL.COLABORADOR]: 'Colaborador',
  [PAPEL.ATRIBUCION]: 'Editas de acuerdo a tu cargo',
  [PAPEL.SEGUIMIENTO]: 'Solo seguimiento',
  [PAPEL.LECTOR]: 'Solo lectura',
};

export const DESCRIPCION_PAPEL = {
  [PAPEL.RESPONSABLE]: 'Editas el proyecto, designas participantes y puedes eliminarlo.',
  [PAPEL.COLABORADOR]: 'Participas en este proyecto: capturas avances, comentas y subes evidencias.',
  [PAPEL.ATRIBUCION]: 'Tu cargo te permite editar este proyecto, aunque no participes en él.',
  [PAPEL.SEGUIMIENTO]: 'Consultas el proyecto y designas participantes. La información la edita el área responsable.',
  [PAPEL.LECTOR]: 'Consultas todo el proyecto, sin modificarlo.',
};

// Clases de color por papel. Guinda para quien encabeza, azul para quien
// participa, ámbar para la atribución que viene del cargo (que conviene
// que se note distinta), gris para la consulta y el seguimiento.
export const COLOR_PAPEL = {
  [PAPEL.RESPONSABLE]: 'bg-guinda-50 text-guinda-700 border-guinda-200',
  [PAPEL.COLABORADOR]: 'bg-blue-50 text-blue-700 border-blue-200',
  [PAPEL.ATRIBUCION]: 'bg-amber-50 text-amber-700 border-amber-200',
  [PAPEL.SEGUIMIENTO]: 'bg-slate-50 text-slate-600 border-slate-200',
  [PAPEL.LECTOR]: 'bg-gray-50 text-gray-500 border-gray-200',
};

// Papeles que implican participación real en el proyecto (aparecen
// siempre) frente a los que solo describen el alcance del cargo (ruido
// en un listado: se repetirían idénticos en cada tarjeta).
const PAPELES_DE_PARTICIPACION = [PAPEL.RESPONSABLE, PAPEL.COLABORADOR, PAPEL.ATRIBUCION];

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

  // El superadmin administra la plataforma; el ejecutivo y el director
  // ejercen atribuciones sobre su ámbito. Ninguno participa en el
  // proyecto, así que nombrarlos "Responsable" sería inexacto.
  if (usuario.rol === 'superadmin') return PAPEL.ATRIBUCION;
  if ((usuario.rol === 'ejecutivo' || usuario.rol === 'direccion') && esMismaDG) return PAPEL.ATRIBUCION;

  if (rolProyecto === 'colaborador') return PAPEL.COLABORADOR;

  // Fuera de su Dirección General, el ejecutivo consulta y designa
  // participantes, pero no edita: es un alcance distinto al de un lector.
  if (usuario.rol === 'ejecutivo') return PAPEL.SEGUIMIENTO;

  return PAPEL.LECTOR;
}

// ¿Participa de verdad en el proyecto? Es lo que responde el filtro
// "Donde participo": tener atribuciones por el cargo no es participar.
export function participaEn(proyecto, usuario) {
  const papel = calcularPapel(proyecto, usuario);
  return papel === PAPEL.RESPONSABLE || papel === PAPEL.COLABORADOR;
}

// ¿Vale la pena mostrar el papel en un listado de tarjetas? Solo cuando
// distingue a este proyecto de los demás.
export function papelRelevanteEnListado(papel) {
  return PAPELES_DE_PARTICIPACION.includes(papel);
}
