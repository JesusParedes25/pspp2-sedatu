/**
 * ARCHIVO: categoriasEvidencia.js
 * PROPÓSITO: Constante compartida de categorías válidas de evidencia —
 *            debe coincidir con evidencias_categoria_check (migración
 *            028_evidencias_links_categories.sql). Un icono por
 *            categoría, para que se lea de un vistazo en cualquier lista
 *            de evidencias (SeccionArchivosNodo, ModalRegistrarAvance).
 */
const CATEGORIAS_EVIDENCIA = [
  { value: 'Documento', icon: '📄' },
  { value: 'Fotografía', icon: '📷' },
  { value: 'Capa geográfica', icon: '🗺️' },
  { value: 'Paquete de capas geográficas', icon: '📦' },
  { value: 'Video', icon: '🎬' },
  { value: 'Repositorio', icon: '💻' },
  { value: 'Audio', icon: '🎵' },
  { value: 'Otro', icon: '📎' },
];

export default CATEGORIAS_EVIDENCIA;
