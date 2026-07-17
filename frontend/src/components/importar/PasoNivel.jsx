/**
 * ARCHIVO: PasoNivel.jsx
 * PROPÓSITO: Paso 2 del wizard — seleccionar qué representan las filas.
 *
 * Opciones:
 *   Componentes  → se mapean a tabla etapas
 *   Acciones     → se mapean a tabla acciones (requiere padre componente)
 *   Tareas       → se mapean a tabla acciones con id_accion_padre (requiere padre acción)
 */
import { useState } from 'react';
import { ChevronRight, Layers, Zap, ListChecks } from 'lucide-react';

const OPCIONES_NIVEL = [
  {
    value: 'etapa',
    label: 'Componentes',
    desc: 'Cada fila es un componente del proyecto. Se creará una etapa por cada fila del archivo.',
    icono: Layers,
    color: 'blue',
  },
  {
    value: 'accion',
    label: 'Acciones',
    desc: 'Cada fila es una acción. Necesitarás indicar a qué componente pertenece cada una.',
    icono: Zap,
    color: 'amber',
  },
  {
    value: 'subaccion',
    label: 'Tareas',
    desc: 'Cada fila es una tarea (subacción). Necesitarás indicar a qué acción padre pertenece cada una.',
    icono: ListChecks,
    color: 'purple',
  },
];

export default function PasoNivel({ config, onCambiar, onAvanzar }) {
  const [rowLevel, setRowLevel] = useState(config.rowLevel || 'etapa');

  const guardar = () => {
    onCambiar({ rowLevel });
    onAvanzar();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Nivel de la fila</h3>
        <p className="text-xs text-gray-500 mt-1">
          ¿Qué representan las filas de tu archivo?
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {OPCIONES_NIVEL.map(opt => {
          const Icono = opt.icono;
          const activo = rowLevel === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setRowLevel(opt.value)}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                activo
                  ? `border-${opt.color}-500 bg-${opt.color}-50 shadow-sm`
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
                activo ? `bg-${opt.color}-100 text-${opt.color}-600` : 'bg-gray-100 text-gray-400'
              }`}>
                <Icono size={18} />
              </div>
              <span className="text-sm font-semibold block">{opt.label}</span>
              <span className="text-xs text-gray-500 mt-1 block leading-relaxed">{opt.desc}</span>
            </button>
          );
        })}
      </div>

      {rowLevel !== 'etapa' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            {rowLevel === 'accion'
              ? 'En el siguiente paso podrás mapear tus columnas. Después te pediremos que indiques qué columna contiene el nombre del componente padre.'
              : 'En el siguiente paso podrás mapear tus columnas. Después te pediremos que indiques qué columna contiene el nombre de la acción padre.'}
          </p>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={guardar}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
