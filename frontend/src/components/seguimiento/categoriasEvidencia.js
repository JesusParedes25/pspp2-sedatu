/**
 * ARCHIVO: categoriasEvidencia.js
 * PROPÓSITO: Constante compartida de categorías válidas de evidencia.
 *            Debe coincidir con el CHECK constraint de la tabla evidencias.
 */
const CATEGORIAS_EVIDENCIA = [
  { valor: 'Otro',        etiqueta: 'Otro' },
  { valor: 'Planos',      etiqueta: 'Planos' },
  { valor: 'Oficios',     etiqueta: 'Oficios' },
  { valor: 'Minutas',     etiqueta: 'Minutas' },
  { valor: 'Estudios',    etiqueta: 'Estudios' },
  { valor: 'Fotografias', etiqueta: 'Fotografías' },
  { valor: 'Contratos',   etiqueta: 'Contratos' },
  { valor: 'Geoespacial', etiqueta: 'Geoespacial' },
  { valor: 'Scripts',     etiqueta: 'Scripts' },
  { valor: 'Reportes',    etiqueta: 'Reportes' },
];

export default CATEGORIAS_EVIDENCIA;
