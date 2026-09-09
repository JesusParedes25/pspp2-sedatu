/**
 * ARCHIVO: categoriasEvidencia.js
 * PROPÓSITO: Constante compartida de categorías válidas de evidencia —
 *            debe coincidir con evidencias_categoria_check (migración
 *            028_evidencias_links_categories.sql). Un icono por
 *            categoría, para que se lea de un vistazo en cualquier lista
 *            de evidencias (SeccionArchivosNodo, FilaDocumentoPendiente,
 *            y el módulo global de Documentos en pages/Evidencias.jsx).
 *            Única fuente — no crear otra copia local: así fue como el
 *            selector real terminó desincronizado con el catálogo
 *            administrable de "Tipo Evidencia" (que nunca se conectó a
 *            nada; se retiró de Administración → Catálogos por eso).
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
