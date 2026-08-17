/**
 * ARCHIVO: roles.js
 * PROPÓSITO: Cómo se le muestra al usuario cada rol de la plataforma.
 *
 * MINI-CLASE: el nombre interno no tiene por qué ser el nombre visible
 * ─────────────────────────────────────────────────────────────────
 * En la base de datos el rol se guarda como 'superadmin', 'ejecutivo',
 * 'direccion', 'enlace' o 'externo'. Esos valores están en la columna
 * `usuarios.rol`, en los CHECK de la tabla, en los tokens ya emitidos y
 * en decenas de comparaciones del backend: cambiarlos exigiría una
 * migración y tocar código en todas partes, con riesgo real de dejar a
 * alguien sin acceso.
 *
 * No hace falta. Lo que le molestaba al usuario no era el valor, era la
 * palabra en pantalla: "Ejecutivo" no es un puesto de la Secretaría ni
 * dice qué alcance tiene. Aquí se traduce a un nombre institucional y a
 * una descripción de lo que puede hacer, sin tocar un solo dato.
 *
 * Regla: la base habla en claves, la pantalla habla en español.
 * ─────────────────────────────────────────────────────────────────
 */

// Orden de mayor a menor alcance. Es el que se usa en los selectores.
export const ROLES = ['superadmin', 'ejecutivo', 'direccion', 'enlace', 'externo'];

export const ETIQUETA_ROL = {
  superadmin: 'Administrador',
  ejecutivo: 'Institucional',
  direccion: 'Dirección General',
  enlace: 'Enlace',
  externo: 'Externo',
};

// Una línea que responde "¿y ese rol qué puede hacer?". Se muestra en el
// panel de administración, al asignar el rol a alguien.
export const DESCRIPCION_ROL = {
  superadmin: 'Administra la plataforma: usuarios, catálogos e integraciones.',
  ejecutivo: 'Consulta toda la Secretaría y designa participantes en cualquier proyecto. Edita los de su Dirección General.',
  direccion: 'Edita y da seguimiento a los proyectos de su Dirección General.',
  enlace: 'Captura y da seguimiento a los proyectos en los que participa.',
  externo: 'Participa únicamente en las acciones que se le asignan.',
};

export const COLOR_ROL = {
  superadmin: 'bg-guinda-100 text-guinda-700',
  ejecutivo: 'bg-purple-100 text-purple-700',
  direccion: 'bg-blue-100 text-blue-700',
  enlace: 'bg-green-100 text-green-700',
  externo: 'bg-gray-100 text-gray-600',
};

// Para roles viejos o inesperados se devuelve la clave tal cual: es
// preferible ver 'operativo' que ver un hueco en blanco.
export const etiquetaRol = rol => ETIQUETA_ROL[rol] || rol || '—';
export const colorRol = rol => COLOR_ROL[rol] || 'bg-gray-100 text-gray-600';
