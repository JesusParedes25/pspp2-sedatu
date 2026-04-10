/**
 * ARCHIVO: EstadoChip.jsx
 * PROPÓSITO: Chip visual que muestra el estado de una entidad con color semántico.
 *
 * MINI-CLASE: Mapeo de estados a colores
 * ─────────────────────────────────────────────────────────────────
 * Cada estado del sistema tiene un color asociado que comunica
 * visualmente su significado: verde = completado, amarillo = en
 * proceso, rojo = bloqueado, gris = pendiente. Este componente
 * recibe un string de estado y devuelve un chip con el color y
 * texto correctos. Se usa en etapas, acciones, proyectos y riesgos.
 * ─────────────────────────────────────────────────────────────────
 */

// Mapeo de cada estado posible a sus clases de Tailwind
const estilosPorEstado = {
  // Proyectos y subproyectos
  Programado:    'bg-gray-100 text-gray-700',
  En_proceso:    'bg-blue-100 text-blue-700',
  Pausado:       'bg-yellow-100 text-yellow-700',
  Concluido:     'bg-green-100 text-green-700',
  Cancelado:     'bg-red-100 text-red-700',
  // Etapas y acciones
  Pendiente:     'bg-gray-100 text-gray-700',
  Bloqueada:     'bg-red-100 text-red-700',
  Completada:    'bg-green-100 text-green-700',
  Cancelada:     'bg-red-100 text-red-500',
  // Riesgos
  Abierto:       'bg-orange-100 text-orange-700',
  En_mitigacion: 'bg-yellow-100 text-yellow-700',
  Resuelto:      'bg-green-100 text-green-700',
  Cerrado:       'bg-gray-100 text-gray-500',
  // Niveles de riesgo
  Bajo:          'bg-green-100 text-green-700',
  Medio:         'bg-yellow-100 text-yellow-700',
  Alto:          'bg-orange-100 text-orange-700',
  Critico:       'bg-red-100 text-red-700',
  // Permisos
  Aceptado:      'bg-green-100 text-green-700',
  Rechazado:     'bg-red-100 text-red-700',
  Revocado:      'bg-gray-100 text-gray-500',
};

// Convertir estado con guiones bajos a texto legible
function formatearEstado(estado) {
  return estado.replace(/_/g, ' ');
}

export default function EstadoChip({ estado, className = '' }) {
  const estilos = estilosPorEstado[estado] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${estilos} ${className}`}>
      {formatearEstado(estado)}
    </span>
  );
}
