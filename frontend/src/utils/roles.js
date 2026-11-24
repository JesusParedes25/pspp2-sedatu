/**
 * ARCHIVO: roles.js
 * PROPÓSITO: Lo que la interfaz necesita saber de los roles de la
 *            plataforma: cuáles hay, de qué color se pintan y qué puede
 *            hacer cada uno.
 *
 * NOTA TÉCNICA: el nombre visible es el mismo que el guardado (a propósito)
 * ─────────────────────────────────────────────────────────────────
 * Se probó traducir los roles a nombres descriptivos en pantalla
 * ('ejecutivo' → "Institucional") y se descartó: en una plataforma
 * institucional conviene que lo que se ve sea lo mismo que se guarda y
 * lo mismo que se dice en una llamada. Dos vocabularios para lo mismo
 * —uno en la pantalla y otro en la base— obliga a traducir mentalmente
 * en cada conversación de soporte.
 *
 * Lo que sí faltaba era explicar qué implica cada rol. Eso vive en
 * DESCRIPCION_ROL y se muestra al asignarlo, que es el momento en que
 * la duda aparece.
 *
 * NOTA HISTÓRICA: hasta la migración 034 los roles se llamaban
 * 'Ejecutivo', 'Directivo', 'Responsable' y 'Operativo'. 'enlace' es
 * hoy el resultado de fundir 'Responsable' y 'Operativo' en uno solo.
 *
 * 'direccion_general' (paso 15 DGTIC, migración 090): un nivel arriba de
 * 'direccion' en la jerarquía institucional — una Dirección General
 * contiene varias Direcciones de Área. Ve el contenido de trabajo de
 * TODAS las áreas de su DG (comentarios, documentos, riesgos, bitácora,
 * actividad), con tope en lectura — nunca edita sin participar, igual
 * que el bono de DG de 'direccion' (ver docs/modelo-permisos.md 5.1/9.1).
 * ─────────────────────────────────────────────────────────────────
 */

// Orden de mayor a menor alcance. Es el que se usa en los selectores.
export const ROLES = ['superadmin', 'ejecutivo', 'direccion_general', 'direccion', 'enlace', 'externo'];

// Una línea que responde "¿y ese rol qué puede hacer?". Se muestra en el
// panel de administración, debajo del selector, al asignarlo.
export const DESCRIPCION_ROL = {
  superadmin: 'Administra la plataforma: usuarios, catálogos e integraciones.',
  ejecutivo: 'Consulta toda la Secretaría y designa participantes en cualquier proyecto. Edita los de su Dirección General.',
  direccion_general: 'Consulta los proyectos de todas las Direcciones de Área de su Dirección General, con su contenido de trabajo (comentarios, documentos, riesgos). No edita automáticamente: para capturar necesita participar.',
  direccion: 'Edita y da seguimiento a los proyectos de su Dirección General.',
  enlace: 'Captura y da seguimiento a los proyectos en los que participa.',
  externo: 'Participa únicamente en las acciones que se le asignan.',
};

export const COLOR_ROL = {
  superadmin: 'bg-guinda-100 text-guinda-700',
  ejecutivo: 'bg-purple-100 text-purple-700',
  direccion_general: 'bg-indigo-100 text-indigo-700',
  direccion: 'bg-blue-100 text-blue-700',
  enlace: 'bg-green-100 text-green-700',
  externo: 'bg-gray-100 text-gray-600',
};

export const colorRol = rol => COLOR_ROL[rol] || 'bg-gray-100 text-gray-600';
