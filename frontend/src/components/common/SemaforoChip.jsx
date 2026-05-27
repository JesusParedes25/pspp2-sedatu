/**
 * ARCHIVO: SemaforoChip.jsx
 * PROPÓSITO: Pastilla visual de semaforización universal.
 *
 * Muestra un dot de color + etiqueta opcional que indica el estado
 * del semáforo (verde, amarillo, naranja, rojo, gris, azul, negro).
 * Se usa en EtapaCard, AccionItem, DataGrid y cualquier lista.
 */

const SEMAFORO_CONFIG = {
  verde:    { bg: 'bg-green-700',  ring: 'ring-green-200',  label: 'Completado',  text: 'text-green-700' },
  amarillo: { bg: 'bg-yellow-500', ring: 'ring-yellow-200', label: 'En proceso',  text: 'text-yellow-700' },
  naranja:  { bg: 'bg-orange-500', ring: 'ring-orange-200', label: 'En riesgo',   text: 'text-orange-700' },
  rojo:     { bg: 'bg-red-800',    ring: 'ring-red-200',    label: 'Crítico',     text: 'text-red-800' },
  gris:     { bg: 'bg-gray-400',   ring: 'ring-gray-200',   label: 'No iniciado', text: 'text-gray-600' },
  azul:     { bg: 'bg-blue-700',   ring: 'ring-blue-200',   label: 'Publicado',   text: 'text-blue-700' },
  negro:    { bg: 'bg-gray-800',   ring: 'ring-gray-300',   label: 'Descartado',  text: 'text-gray-800' },
};

/**
 * @param {Object} props
 * @param {string|null} props.valor - Clave del semáforo (verde, amarillo, etc.)
 * @param {boolean} [props.mostrarLabel=false] - Mostrar la etiqueta textual
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Tamaño del dot
 * @param {string} [props.className] - Clases adicionales
 */
export default function SemaforoChip({ valor, mostrarLabel = false, size = 'md', className = '' }) {
  if (!valor || !SEMAFORO_CONFIG[valor]) return null;

  const config = SEMAFORO_CONFIG[valor];
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={config.label}>
      <span className={`${sizeClasses[size]} rounded-full ${config.bg} ring-2 ${config.ring}`} />
      {mostrarLabel && (
        <span className={`text-xs font-medium ${config.text}`}>
          {config.label}
        </span>
      )}
    </span>
  );
}

export { SEMAFORO_CONFIG };
