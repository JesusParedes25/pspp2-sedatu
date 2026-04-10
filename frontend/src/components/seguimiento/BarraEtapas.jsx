/**
 * ARCHIVO: BarraEtapas.jsx
 * PROPÓSITO: Barra visual horizontal que muestra el progreso de todas las etapas.
 *
 * MINI-CLASE: Visualización de progreso multi-etapa
 * ─────────────────────────────────────────────────────────────────
 * Esta barra divide el ancho disponible entre las etapas del proyecto.
 * Cada segmento tiene un color según el estado de la etapa: verde
 * (completada), azul (en proceso), gris (pendiente), rojo (bloqueada).
 * Hover muestra el nombre y porcentaje. Es un resumen visual rápido
 * del avance general del proyecto.
 * ─────────────────────────────────────────────────────────────────
 */

const coloresPorEstado = {
  Completada: 'bg-green-500',
  En_proceso: 'bg-blue-500',
  Pendiente:  'bg-gray-300',
  Bloqueada:  'bg-red-400',
  Cancelada:  'bg-gray-200',
};

export default function BarraEtapas({ etapas = [] }) {
  if (etapas.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
        {etapas.map(etapa => (
          <div
            key={etapa.id}
            title={`${etapa.nombre}: ${parseFloat(etapa.porcentaje_calculado || 0).toFixed(0)}%`}
            className={`transition-all duration-300 ${coloresPorEstado[etapa.estado] || 'bg-gray-300'}`}
            style={{ width: `${100 / etapas.length}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>Etapa 1</span>
        <span>Etapa {etapas.length}</span>
      </div>
    </div>
  );
}
