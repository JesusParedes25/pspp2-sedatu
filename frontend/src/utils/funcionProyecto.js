/**
 * ARCHIVO: funcionProyecto.js
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

// Las FUNCIONES, del más al menos capaz. El orden importa: se devuelve la
// primera que aplique.
//
// No confundir función con PERFIL. El perfil (usuarios.rol: superadmin,
// ejecutivo, direccion, enlace, externo) es lo que la persona es en la
// Secretaría y no cambia de un proyecto a otro. La función es lo que hace
// en ESTE proyecto. El perfil dice dónde alcanza; la función, qué hace.
//
// El texto se dirige al usuario y le dice directamente qué puede hacer.
// Directo no es informal: se evita tanto el lenguaje coloquial como la
// redacción de oficio que nadie lee.
export const FUNCION = {
  RESPONSABLE: 'responsable',
  COLABORADOR: 'colaborador',
  ATRIBUCION: 'atribucion',    // edita por su cargo, sin participar en el proyecto
  SEGUIMIENTO: 'seguimiento',  // consulta y designa participantes, sin editar
  PARCIAL: 'parcial',          // solo captura en las partes que le asignaron
  LECTOR: 'lector',
};

export const ETIQUETA_FUNCION = {
  [FUNCION.RESPONSABLE]: 'Responsable',
  [FUNCION.COLABORADOR]: 'Colaborador',
  [FUNCION.ATRIBUCION]: 'Edición institucional',
  [FUNCION.SEGUIMIENTO]: 'Solo seguimiento',
  [FUNCION.PARCIAL]: 'Participas en una parte',
  [FUNCION.LECTOR]: 'Solo lectura',
};

export const DESCRIPCION_FUNCION = {
  [FUNCION.RESPONSABLE]: 'Editas el proyecto, designas participantes y puedes eliminarlo.',
  [FUNCION.COLABORADOR]: 'Participas en este proyecto: capturas avances, comentas y subes evidencias.',
  [FUNCION.ATRIBUCION]: 'Tu cargo te permite editar este proyecto, aunque no participes en él.',
  [FUNCION.SEGUIMIENTO]: 'Consultas el proyecto y designas participantes. La información la edita el área responsable.',
  [FUNCION.PARCIAL]: 'Capturas solo en las etapas o acciones a las que te invitaron. El resto del proyecto lo consultas.',
  [FUNCION.LECTOR]: 'Consultas todo el proyecto, sin modificarlo.',
};

// Clases de color por función. Guinda para quien encabeza, azul para quien
// participa, ámbar para la atribución que viene del cargo (que conviene
// que se note distinta), gris para la consulta y el seguimiento.
export const COLOR_FUNCION = {
  [FUNCION.RESPONSABLE]: 'bg-guinda-50 text-guinda-700 border-guinda-200',
  [FUNCION.COLABORADOR]: 'bg-blue-50 text-blue-700 border-blue-200',
  [FUNCION.ATRIBUCION]: 'bg-amber-50 text-amber-700 border-amber-200',
  [FUNCION.SEGUIMIENTO]: 'bg-slate-50 text-slate-600 border-slate-200',
  [FUNCION.PARCIAL]: 'bg-blue-50 text-blue-700 border-blue-200',
  [FUNCION.LECTOR]: 'bg-gray-50 text-gray-500 border-gray-200',
};

// Funciones que implican participación real en el proyecto (aparecen
// siempre) frente a los que solo describen el alcance del cargo (ruido
// en un listado: se repetirían idénticos en cada tarjeta).
const FUNCIONES_DE_PARTICIPACION = [FUNCION.RESPONSABLE, FUNCION.COLABORADOR, FUNCION.ATRIBUCION, FUNCION.PARCIAL];

/**
 * @param {object} proyecto  necesita id_creador, id_dg_lider y, si se
 *                           conoce, rol_usuario_actual (o mi_rol_proyecto
 *                           en el listado)
 * @param {object} usuario   el usuario autenticado
 */
export function calcularFuncion(proyecto, usuario, permisos) {
  if (!proyecto || !usuario) return FUNCION.LECTOR;

  const rolProyecto = proyecto.rol_usuario_actual || proyecto.mi_rol_proyecto || null;
  const esCreador = usuario.id === proyecto.id_creador;
  const esMismaDG = !!usuario.id_dg && usuario.id_dg === proyecto.id_dg_lider;

  if (esCreador || rolProyecto === 'responsable') return FUNCION.RESPONSABLE;

  // El superadmin administra la plataforma; el ejecutivo y el director
  // ejercen atribuciones sobre su ámbito. Ninguno participa en el
  // proyecto, así que nombrarlos "Responsable" sería inexacto.
  if (usuario.rol === 'superadmin') return FUNCION.ATRIBUCION;
  if ((usuario.rol === 'ejecutivo' || usuario.rol === 'direccion') && esMismaDG) return FUNCION.ATRIBUCION;

  if (rolProyecto === 'colaborador') return FUNCION.COLABORADOR;

  // Invitado solo a una etapa o acción: no participa en el proyecto
  // entero, pero tampoco es un lector. Solo el servidor lo sabe, así que
  // se toma de los permisos cuando quien pinta el chip los tiene a mano.
  if (permisos?.capturaParcial) return FUNCION.PARCIAL;

  // Fuera de su Dirección General, el ejecutivo consulta y designa
  // participantes, pero no edita: es un alcance distinto al de un lector.
  if (usuario.rol === 'ejecutivo') return FUNCION.SEGUIMIENTO;

  return FUNCION.LECTOR;
}

// ¿Participa de verdad en el proyecto? Es lo que responde el filtro
// "Donde participo": tener atribuciones por el cargo no es participar.
export function participaEn(proyecto, usuario) {
  const funcion = calcularFuncion(proyecto, usuario);
  return funcion === FUNCION.RESPONSABLE || funcion === FUNCION.COLABORADOR;
}

// ¿Vale la pena mostrar la función en un listado de tarjetas? Solo cuando
// distingue a este proyecto de los demás.
export function funcionRelevanteEnListado(funcion) {
  return FUNCIONES_DE_PARTICIPACION.includes(funcion);
}
