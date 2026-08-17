/**
 * ARCHIVO: NodoArbol.jsx
 * PROPÓSITO: Fila recursiva del árbol izquierdo (etapa → acción → tarea).
 */
import { ChevronRight, ChevronDown } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import AvanceInlineArbol from './AvanceInlineArbol';
import CrearInline from './CrearInline';
import { NIVELES } from '../../../config/niveles';
import { permisosDeNodo } from '../../../hooks/usePermisos';

export default function NodoArbol({ nodo, tipo, nivel: profundidad, expandidos, seleccionadoId, onToggle, onSelect, permisos, proyectoId, onCreado, mostrarToast }) {
  const esExpandido = expandidos.has(nodo.id);
  const esSeleccionado = seleccionadoId === nodo.id;
  const hijos = tipo === 'etapa' ? (nodo.acciones || []) : (nodo.tareas || []);
  const tieneHijos = hijos.length > 0;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  // Ícono + color de NIVEL (¿qué tipo de cosa es esto?) — canal separado
  // del punto de semáforo de abajo, que es color de ESTATUS (¿cómo va?).
  // Nunca se combinan en el mismo elemento.
  const nivelInfo = NIVELES[tipo];
  const Icono = nivelInfo.icono;
  // Edición rápida de % solo en nodos hoja que no sean etapa (una etapa
  // siempre agrega de sus acciones, nunca tiene avance propio editable).
  const permisosAqui = permisosDeNodo(permisos, tipo, nodo.id);
  const puedeEditarAvanceRapido = tipo !== 'etapa' && !tieneHijos && !permisosAqui.esSoloLectura;

  return (
    <div>
      <div
        className={`flex items-center gap-1 pr-2 cursor-pointer transition-colors group
          ${esSeleccionado ? 'bg-[#7B1C3E]/5 border-l-2 border-[#7B1C3E]' : 'border-l-2 border-transparent hover:bg-gray-100'}`}
        style={{ paddingLeft: `${profundidad * 16 + 8}px` }}
      >
        {/* Triángulo expandir */}
        <button
          onClick={(e) => { e.stopPropagation(); if (tieneHijos) onToggle(nodo.id); }}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        >
          {tieneHijos ? (
            esExpandido ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />
          ) : <span className="w-3" />}
        </button>

        {/* Ícono de NIVEL (color propio, distinto del semáforo) */}
        <Icono size={11} style={{ color: nivelInfo.color }} className="flex-shrink-0" aria-hidden="true" />

        {/* Punto semáforo — componente compartido con Vista Lista para que
            el mismo nodo se vea con el mismo color en ambas vistas */}
        <SemaforoDot semaforo={sem} estado={nodo.estado} size={8} />

        {/* Nombre */}
        <button
          onClick={() => onSelect(tipo, nodo.id, nodo)}
          className="flex-1 text-left truncate py-1.5 min-w-0"
          title={nodo.nombre}
        >
          <span className={`text-xs ${esSeleccionado ? 'font-semibold text-[#7B1C3E]' : 'text-gray-700'} truncate block`}>
            {nodo.nombre}
          </span>
        </button>

        {/* % avance — clic para editar en hojas (acción/tarea) */}
        {puedeEditarAvanceRapido ? (
          <AvanceInlineArbol
            key={`${nodo.id}-${avance}`}
            valor={avance}
            tipo={tipo}
            nodoId={nodo.id}
            estado={nodo.estado}
            onGuardado={onCreado}
            mostrarToast={mostrarToast}
          />
        ) : (
          <span className="text-[10px] tabular-nums font-medium text-gray-400 flex-shrink-0 w-8 text-right">
            {Math.round(avance)}%
          </span>
        )}
      </div>

      {/* Hijos */}
      {esExpandido && hijos.map(hijo => (
        <NodoArbol
          key={hijo.id}
          nodo={hijo}
          tipo={tipo === 'etapa' ? 'accion' : 'tarea'}
          nivel={profundidad + 1}
          expandidos={expandidos}
          seleccionadoId={seleccionadoId}
          onToggle={onToggle}
          onSelect={onSelect}
          permisos={permisos}
          proyectoId={proyectoId}
          onCreado={onCreado}
          mostrarToast={mostrarToast}
        />
      ))}

      {/* Botón "+ Acción" o "+ Tarea" al final de rama expandida */}
      {esExpandido && permisosAqui.puedeCrearAccion && (
        <div style={{ paddingLeft: `${(profundidad + 1) * 16 + 8}px` }}>
          <CrearInline
            tipo={tipo === 'etapa' ? 'accion' : 'tarea'}
            padreId={nodo.id}
            proyectoId={proyectoId}
            onCreado={onCreado}
          />
        </div>
      )}
    </div>
  );
}
