/**
 * ARCHIVO: BarraProgreso.jsx
 * PROPÓSITO: Barra de progreso visual con porcentaje y color dinámico.
 *
 * MINI-CLASE: Progreso visual con Tailwind
 * ─────────────────────────────────────────────────────────────────
 * La barra cambia de color según el porcentaje: rojo (<25%),
 * naranja (25-50%), amarillo (50-75%), verde (>75%). También puede
 * mostrar un indicador fraccionario como "16/92" para indicadores
 * con meta numérica. El ancho se calcula con style inline porque
 * Tailwind no soporta valores dinámicos en clases.
 * ─────────────────────────────────────────────────────────────────
 */

// Determina el color de la barra según el porcentaje
function obtenerColor(porcentaje) {
  if (porcentaje >= 75) return 'bg-green-500';
  if (porcentaje >= 50) return 'bg-yellow-500';
  if (porcentaje >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function BarraProgreso({ porcentaje = 0, actual, meta, unidad, mostrarTexto = true, className = '' }) {
  const porcentajeSeguro = Math.min(100, Math.max(0, parseFloat(porcentaje) || 0));
  const colorBarra = obtenerColor(porcentajeSeguro);

  return (
    <div className={className}>
      {/* Texto superior con porcentaje o fracción */}
      {mostrarTexto && (
        <div className="flex items-center justify-between mb-1">
          {actual !== undefined && meta !== undefined ? (
            <span className="text-sm font-medium text-gray-700">
              {actual}/{meta} {unidad || ''}
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-700">
              {porcentajeSeguro.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {/* Barra visual */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorBarra}`}
          style={{ width: `${porcentajeSeguro}%` }}
        />
      </div>
    </div>
  );
}
