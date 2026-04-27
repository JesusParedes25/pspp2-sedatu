/**
 * ARCHIVO: FiltrosProyectos.jsx
 * PROPÓSITO: Barra de filtros para el listado de proyectos.
 *
 * MINI-CLASE: Filtros como chips seleccionables
 * ─────────────────────────────────────────────────────────────────
 * Los filtros se presentan como chips clickeables que alternan
 * entre activo e inactivo. Al seleccionar un filtro, se llama a
 * onCambio con los nuevos filtros y el hook useProyectos recarga
 * automáticamente. El chip activo tiene fondo guinda; el inactivo
 * tiene fondo gris. Filtrar por estado es lo más común.
 * ─────────────────────────────────────────────────────────────────
 */
import { Search } from 'lucide-react';

const estados = [
  { valor: 'Pendiente',   etiqueta: 'Pendiente' },
  { valor: 'En_proceso',  etiqueta: 'En proceso' },
  { valor: 'Bloqueada',   etiqueta: 'Bloqueada' },
  { valor: 'Completada',  etiqueta: 'Completada' },
  { valor: 'Cancelada',   etiqueta: 'Cancelada' },
];
const tipos = [
  { valor: 'Analisis_tecnico', etiqueta: 'Análisis técnico' },
  { valor: 'Obra_fisica', etiqueta: 'Obra física' },
  { valor: 'Programa_masivo', etiqueta: 'Programa masivo' },
  { valor: 'Regularizacion', etiqueta: 'Regularización' },
  { valor: 'Proceso_recurrente', etiqueta: 'Proceso recurrente' },
  { valor: 'Instrumento_planeacion', etiqueta: 'Instrumento de planeación' },
  { valor: 'Conflicto_agrario', etiqueta: 'Conflicto agrario' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

export default function FiltrosProyectos({ filtros, onCambio }) {
  return (
    <div className="space-y-3">
      {/* Búsqueda */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o descripción..."
          value={filtros.busqueda || ''}
          onChange={e => onCambio({ busqueda: e.target.value || undefined, pagina: 1 })}
          className="input-base pl-9"
        />
      </div>

      {/* Chips de estado */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center mr-1">Estado:</span>
        {estados.map(estado => (
          <button
            key={estado.valor}
            onClick={() => onCambio({
              estado: filtros.estado === estado.valor ? undefined : estado.valor,
              pagina: 1
            })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filtros.estado === estado.valor
                ? 'bg-guinda-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {estado.etiqueta}
          </button>
        ))}
      </div>

      {/* Select de tipo */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Tipo:</span>
        <select
          value={filtros.tipo || ''}
          onChange={e => onCambio({ tipo: e.target.value || undefined, pagina: 1 })}
          className="input-base w-auto text-xs"
        >
          <option value="">Todos los tipos</option>
          {tipos.map(tipo => (
            <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
